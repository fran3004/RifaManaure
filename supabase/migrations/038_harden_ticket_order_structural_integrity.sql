-- ============================================================================
-- MIGRACIÓN 038: Fortalecimiento de Integridad Estructural en Tickets y Órdenes
-- Resoluciones Transaccionales para Hallazgos DB-06, DB-07, DB-08, DB-09, DB-11
-- ============================================================================

-- 1. DB-11: Asegurar NOT NULL en columnas de estado
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders 
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.tickets 
    ALTER COLUMN status SET NOT NULL;

-- 2. DB-08 & DB-09: Garantizar Integridad Referencial Compuesta (raffle_id, order_id)
-- ----------------------------------------------------------------------------
-- Paso 2.1: Crear restricción de unicidad en orders(id, raffle_id) requerida para la FK compuesta
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_id_raffle_id_key' 
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders 
            ADD CONSTRAINT orders_id_raffle_id_key UNIQUE (id, raffle_id);
    END IF;
END $$;

-- Paso 2.2: Eliminar la antigua clave foránea tickets_order_id_fkey con ON DELETE SET NULL
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_order_id_fkey;

-- Paso 2.3: Establecer la clave foránea compuesta con ON DELETE RESTRICT (DB-08 y DB-09)
-- Esto impide asociar tickets a órdenes de rifas distintas y prohíbe eliminar órdenes con boletos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'tickets_order_raffle_fkey' 
          AND conrelid = 'public.tickets'::regclass
    ) THEN
        ALTER TABLE public.tickets 
            ADD CONSTRAINT tickets_order_raffle_fkey 
            FOREIGN KEY (order_id, raffle_id) 
            REFERENCES public.orders(id, raffle_id) 
            ON DELETE RESTRICT;
    END IF;
END $$;

-- Paso 2.4: Índice de soporte para acelerar joins y verificaciones de la FK compuesta
CREATE INDEX IF NOT EXISTS idx_tickets_order_raffle 
    ON public.tickets (order_id, raffle_id);

-- 3. DB-11: Restricciones CHECK de Consistencia Estructural en Tickets
-- ----------------------------------------------------------------------------
-- 3.1 Un boleto reservado debe tener fecha de expiración
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_reserved_expiry_check;
ALTER TABLE public.tickets 
    ADD CONSTRAINT tickets_reserved_expiry_check 
    CHECK (status <> 'reserved' OR reservation_expires_at IS NOT NULL);

-- 3.2 Un boleto vendido debe tener tanto order_id como buyer_id
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_sold_order_check;
ALTER TABLE public.tickets 
    ADD CONSTRAINT tickets_sold_order_check 
    CHECK (status <> 'sold' OR (order_id IS NOT NULL AND buyer_id IS NOT NULL));

-- 3.3 Un boleto disponible debe tener sus campos transaccionales completamente limpios
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_available_clean_check;
ALTER TABLE public.tickets 
    ADD CONSTRAINT tickets_available_clean_check 
    CHECK (status <> 'available' OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL));

-- 3.4 Un boleto bloqueado debe tener sus campos transaccionales completamente limpios
ALTER TABLE public.tickets 
    DROP CONSTRAINT IF EXISTS tickets_blocked_clean_check;
ALTER TABLE public.tickets 
    ADD CONSTRAINT tickets_blocked_clean_check 
    CHECK (status <> 'blocked' OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL));

-- 4. DB-06 & DB-07: Trigger de Integridad y Transiciones en Tickets
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status VARCHAR(50);
    v_order_buyer_id UUID;
    v_order_raffle_id UUID;
BEGIN
    -- [DB-06] Irreversibilidad Absoluta de Boletos Vendidos:
    -- Ningún boleto 'sold' puede cambiar de estado a 'available', 'reserved', 'blocked' ni ningún otro.
    IF OLD.status = 'sold' THEN
        IF NEW.status IS DISTINCT FROM 'sold' THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-06): El boleto % ya está vendido (sold) y su estado es comercialmente irreversible. Intento de cambio a "%" denegado.', 
                OLD.number, NEW.status;
        END IF;

        -- [DB-07] Inmutabilidad Estricta de Titularidad y Orden en Boletos Vendidos:
        -- Incluso si NEW.status = OLD.status ('sold'), se prohíbe reasignar comprador u orden.
        IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-07): Prohibido modificar el comprador del boleto vendido número %.', OLD.number;
        END IF;

        IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-07): Prohibido reasignar o desvincular la orden del boleto vendido número %.', OLD.number;
        END IF;

        IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-08): Prohibido reasignar la rifa del boleto vendido número %.', OLD.number;
        END IF;

        IF NEW.number IS DISTINCT FROM OLD.number THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar el número de un boleto vendido (%).', OLD.number;
        END IF;

        -- Se permiten modificaciones exclusivamente no comerciales (ej. updated_at)
        RETURN NEW;
    END IF;

    -- Inmutabilidad de raffle_id y number en cualquier boleto existente
    IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido reasignar la rifa de un boleto existente (id: %, número: %).', OLD.id, OLD.number;
    END IF;

    IF NEW.number IS DISTINCT FROM OLD.number THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar la numeración de un boleto existente (id: %, número: %).', OLD.id, OLD.number;
    END IF;

    -- Si el estado no cambió en boletos no vendidos (ej: actualización de expiración de reserva o timestamp)
    IF OLD.status = NEW.status THEN
        -- Si está reservado, no permitir transferir la orden ya establecida
        IF OLD.status = 'reserved' AND OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
            RAISE EXCEPTION 'Violación de Integridad: El boleto % ya está asignado a la orden % y no puede reasignarse a otra orden mientras esté reservado.', OLD.number, OLD.order_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Validación de Transición hacia 'sold': Solo permitida desde 'reserved' con orden pagada
    IF NEW.status = 'sold' THEN
        IF OLD.status != 'reserved' THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" desde "%". Requiere estar en "reserved".',
                NEW.number, OLD.status;
        END IF;

        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status, buyer_id, raffle_id INTO v_order_status, v_order_buyer_id, v_order_raffle_id
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('paid', 'completed') THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid" o "completed".', 
                NEW.number, NEW.order_id, COALESCE(v_order_status, 'inexistente');
        END IF;

        IF NEW.buyer_id IS DISTINCT FROM v_order_buyer_id THEN
            RAISE EXCEPTION 'Violación de Integridad: El comprador del boleto (%) no coincide con el comprador de la orden (%).',
                NEW.buyer_id, v_order_buyer_id;
        END IF;

        IF NEW.raffle_id IS DISTINCT FROM v_order_raffle_id THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-08): La rifa del boleto (%) no coincide con la rifa de la orden (%).',
                NEW.raffle_id, v_order_raffle_id;
        END IF;
    END IF;

    -- Limpieza estricta de reservas al volver a 'available'
    IF NEW.status = 'available' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Limpieza estricta al pasar a 'blocked'
    IF NEW.status = 'blocked' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Registro en auditoría inmutable
    IF NEW.status = 'sold' OR (OLD.status = 'reserved' AND NEW.status = 'available' AND OLD.order_id IS NOT NULL) THEN
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'TICKET_' || UPPER(NEW.status),
            'ticket',
            NEW.id::TEXT,
            NULL,
            jsonb_build_object(
                'ticket_number', NEW.number,
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'order_id', COALESCE(NEW.order_id, OLD.order_id),
                'buyer_id', COALESCE(NEW.buyer_id, OLD.buyer_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_validate_ticket_status_transition() FROM PUBLIC, anon, authenticated;

-- Recrear el trigger para dispararse en CUALQUIER UPDATE (no solo UPDATE OF status)
DROP TRIGGER IF EXISTS trg_validate_ticket_status ON public.tickets;
CREATE TRIGGER trg_validate_ticket_status
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_ticket_status_transition();

-- 5. Blindaje de Transiciones e Inmutabilidad Comercial en Órdenes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Inmutabilidad de raffle_id y reference en cualquier orden existente
    IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido reasignar la rifa de una orden existente (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    IF NEW.reference IS DISTINCT FROM OLD.reference THEN
        RAISE EXCEPTION 'Violación de Integridad: La referencia comercial de una orden es inmutable (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    -- Blindaje de órdenes pagadas o completadas: proteger términos comerciales inmutables
    IF OLD.status IN ('paid', 'completed') THEN
        IF NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
        END IF;

        IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar el comprador de una orden pagada (ref: %).', OLD.reference;
        END IF;

        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar el monto total de una orden pagada (ref: %).', OLD.reference;
        END IF;

        IF NEW.ticket_count IS DISTINCT FROM OLD.ticket_count THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar la cantidad de boletos de una orden pagada (ref: %).', OLD.reference;
        END IF;
    END IF;

    -- Si el estado no cambió en órdenes no pagadas, permitir actualizaciones normales
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid'/'completed' sin comprobante o referencia de pago
    IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir que órdenes 'expired', 'rejected' o 'cancelled' pasen a 'paid' directamente
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status IN ('paid', 'completed') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- Registro en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'ORDER_STATUS_' || UPPER(NEW.status),
        'order',
        NEW.id::TEXT,
        NEW.verified_by,
        jsonb_build_object(
            'reference', NEW.reference,
            'previous_status', OLD.status,
            'new_status', NEW.status,
            'total_amount', NEW.total_amount,
            'ticket_count', NEW.ticket_count,
            'rejection_reason', NEW.rejection_reason,
            'receipt_url', NEW.receipt_url
        )
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_validate_order_status_transition() FROM PUBLIC, anon, authenticated;

-- Recrear el trigger para dispararse en CUALQUIER UPDATE (no solo UPDATE OF status)
DROP TRIGGER IF EXISTS trg_validate_order_status ON public.orders;
CREATE TRIGGER trg_validate_order_status
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_order_status_transition();
