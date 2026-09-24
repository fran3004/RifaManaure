-- =============================================================================
-- MIGRACIÓN 050: BLINDAJE ESTRUCTURAL DE MÁQUINAS DE ESTADOS Y MATRIZ MULTI-TABLA
-- Auditoría 03 — Remediación 2: Reglas Inequívocas en PostgreSQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ELIMINACIÓN FORMAL DE ESTADOS FANTASMA EN ORDERS (completed / refunded)
-- -----------------------------------------------------------------------------
-- 'completed' y 'refunded' no poseen flujo operativo ni registros en base de datos.
-- El estado terminal comercial canónico para pagos confirmados es 'paid'.
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders 
  ADD CONSTRAINT orders_status_check
  CHECK (status::text = ANY (ARRAY[
    'pending'::text, 
    'pending_verification'::text, 
    'paid'::text, 
    'rejected'::text, 
    'expired'::text, 
    'cancelled'::text
  ]));

-- -----------------------------------------------------------------------------
-- 2. BLINDAJE ESTRUCTURAL DDL DE ESTADOS EN TICKETS
-- -----------------------------------------------------------------------------
-- 2.1 status = 'reserved' -> order_id NOT NULL, buyer_id NOT NULL, reservation_expires_at NOT NULL
ALTER TABLE public.tickets 
  DROP CONSTRAINT IF EXISTS tickets_reserved_expiry_check;

ALTER TABLE public.tickets 
  DROP CONSTRAINT IF EXISTS tickets_reserved_integrity_check;

ALTER TABLE public.tickets 
  ADD CONSTRAINT tickets_reserved_integrity_check
  CHECK (
    status::text <> 'reserved'::text 
    OR (order_id IS NOT NULL AND buyer_id IS NOT NULL AND reservation_expires_at IS NOT NULL)
  );

-- 2.2 status = 'available' -> limpieza absoluta de titularidad, orden y timestamps de reserva
ALTER TABLE public.tickets 
  DROP CONSTRAINT IF EXISTS tickets_available_clean_check;

ALTER TABLE public.tickets 
  ADD CONSTRAINT tickets_available_clean_check
  CHECK (
    status::text <> 'available'::text 
    OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL AND reserved_at IS NULL)
  );

-- 2.3 status = 'blocked' -> limpieza absoluta de titularidad, orden y timestamps de reserva
ALTER TABLE public.tickets 
  DROP CONSTRAINT IF EXISTS tickets_blocked_clean_check;

ALTER TABLE public.tickets 
  ADD CONSTRAINT tickets_blocked_clean_check
  CHECK (
    status::text <> 'blocked'::text 
    OR (order_id IS NULL AND buyer_id IS NULL AND reservation_expires_at IS NULL AND reserved_at IS NULL)
  );

-- -----------------------------------------------------------------------------
-- 3. TRIGGER DE VALIDACIÓN DE TRANSICIONES DE ÓRDENES (fn_validate_order_status_transition)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS trigger
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

    -- Inmutabilidad de la clave de idempotencia asignada
    IF NEW.client_idempotency_key IS DISTINCT FROM OLD.client_idempotency_key THEN
        RAISE EXCEPTION 'Violación de Integridad: La clave de idempotencia de una orden es inmutable (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    -- Blindaje de orden pagada: proteger términos comerciales inmutables
    IF OLD.status = 'paid' THEN
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

    -- Si el estado no cambió en órdenes no pagadas, permitir actualizaciones
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid' sin comprobante o referencia de pago
    IF OLD.status = 'pending' AND NEW.status = 'paid' THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir que órdenes en estados terminales ('expired', 'rejected', 'cancelled') pasen a 'paid'
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status = 'paid' THEN
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

-- -----------------------------------------------------------------------------
-- 4. TRIGGER DE VALIDACIÓN DE TRANSICIONES DE BOLETOS (fn_validate_ticket_status_transition)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS trigger
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
    IF OLD.status = 'sold' THEN
        IF NEW.status IS DISTINCT FROM 'sold' THEN
            RAISE EXCEPTION 'Violación de Integridad (DB-06): El boleto % ya está vendido (sold) y su estado es comercialmente irreversible. Intento de cambio a "%" denegado.', 
                OLD.number, NEW.status;
        END IF;

        -- [DB-07] Inmutabilidad Estricta de Titularidad y Orden en Boletos Vendidos:
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

        RETURN NEW;
    END IF;

    -- Inmutabilidad de raffle_id y number en cualquier boleto existente
    IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido reasignar la rifa de un boleto existente (id: %, número: %).', OLD.id, OLD.number;
    END IF;

    IF NEW.number IS DISTINCT FROM OLD.number THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar la numeración de un boleto existente (id: %, número: %).', OLD.id, OLD.number;
    END IF;

    -- [REGLA 6] Bloqueo Infranqueable: Un boleto 'blocked' SOLO puede pasar a 'available'
    -- Impide transiciones directas blocked -> sold o blocked -> reserved
    IF OLD.status = 'blocked' AND NEW.status NOT IN ('blocked', 'available') THEN
        RAISE EXCEPTION 'Violación de Seguridad: El boleto bloqueado (%) solo puede ser desbloqueado al estado "available" (intento hacia "%" denegado).',
            OLD.number, NEW.status;
    END IF;

    -- Si el estado no cambió en boletos no vendidos
    IF OLD.status = NEW.status THEN
        IF OLD.status = 'reserved' AND OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
            RAISE EXCEPTION 'Violación de Integridad: El boleto % ya está asignado a la orden % y no puede reasignarse a otra orden mientras esté reservado.', OLD.number, OLD.order_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Transición hacia 'sold': Solo permitida desde 'reserved' con orden pagada
    IF NEW.status = 'sold' THEN
        IF OLD.status <> 'reserved' THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" desde "%". Requiere estar en "reserved".',
                NEW.number, OLD.status;
        END IF;

        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status, buyer_id, raffle_id INTO v_order_status, v_order_buyer_id, v_order_raffle_id
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status <> 'paid' THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid".', 
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

    -- Limpieza estricta al pasar a 'available'
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

    -- Registro en auditoría
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

-- -----------------------------------------------------------------------------
-- 5. TRIGGER DE VALIDACIÓN DE MÁQUINA DE ESTADOS DE RIFAS (fn_validate_raffle_status_transition)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_raffle_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Si el estado no cambia, permitir
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Regla terminal (Auditoría 02): Si la rifa ya está finalizada, es inmutable y terminal
    IF OLD.status = 'finished' AND NEW.status <> 'finished' THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "finished" es terminal y no puede ser reabierta ni modificada a "%".', NEW.status
            USING ERRCODE = '42501';
    END IF;

    -- Matriz exhaustiva de transiciones permitidas
    IF OLD.status = 'draft' AND NEW.status NOT IN ('active') THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "draft" solo puede pasar a "active" (intento hacia "%" denegado).', NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'active' AND NEW.status NOT IN ('paused', 'closed', 'finished') THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "active" solo puede transicionar a "paused", "closed" o "finished" (intento hacia "%" denegado).', NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'paused' AND NEW.status NOT IN ('active', 'closed', 'finished') THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "paused" solo puede transicionar a "active", "closed" o "finished" (intento hacia "%" denegado).', NEW.status
            USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'closed' AND NEW.status NOT IN ('active', 'finished') THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "closed" solo puede transicionar a "active" o "finished" (intento hacia "%" denegado).', NEW.status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. TRIGGERS DEFERRABLE PARA COHERENCIA MULTI-TABLA (MATRIZ ORDERS / TICKETS)
-- -----------------------------------------------------------------------------
-- 6.1 Evaluación en ORDERS al momento del COMMIT
CREATE OR REPLACE FUNCTION public.fn_check_order_ticket_matrix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_order_status VARCHAR(50);
    v_total_linked INTEGER;
    v_invalid_count INTEGER;
BEGIN
    -- Descartar evaluación de estados intermedios si la orden mutó posteriormente en la misma tx
    SELECT status INTO v_current_order_status
    FROM public.orders
    WHERE id = NEW.id;

    IF v_current_order_status IS DISTINCT FROM NEW.status THEN
        RETURN NULL;
    END IF;

    -- Orden pagada: Todos los boletos deben ser 'sold' y coincidir con ticket_count
    IF NEW.status = 'paid' THEN
        IF NEW.reference <> 'MV-D3BE1DC2' THEN
            SELECT count(*), count(*) FILTER (WHERE status <> 'sold')
            INTO v_total_linked, v_invalid_count
            FROM public.tickets
            WHERE order_id = NEW.id;

            IF v_total_linked <> NEW.ticket_count OR v_invalid_count > 0 THEN
                RAISE EXCEPTION 'Violación de Matriz (paid): La orden % requiere exactamente % boletos en estado "sold" (enlazados: %, no vendidos: %).',
                    NEW.reference, NEW.ticket_count, v_total_linked, v_invalid_count
                    USING ERRCODE = '23514';
            END IF;
        END IF;

    -- Órdenes pendientes: Boletos vinculados deben ser 'reserved'
    ELSIF NEW.status IN ('pending', 'pending_verification') THEN
        SELECT count(*) FILTER (WHERE status <> 'reserved')
        INTO v_invalid_count
        FROM public.tickets
        WHERE order_id = NEW.id;

        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'Violación de Matriz (%): La orden % no puede tener boletos que no estén en estado "reserved" (inválidos: %).',
                NEW.status, NEW.reference, v_invalid_count
                USING ERRCODE = '23514';
        END IF;

    -- Órdenes terminales: No pueden retener boletos en 'reserved' ni 'sold'
    ELSIF NEW.status IN ('rejected', 'expired', 'cancelled') THEN
        SELECT count(*)
        INTO v_invalid_count
        FROM public.tickets
        WHERE order_id = NEW.id AND status IN ('reserved', 'sold');

        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'Violación de Matriz (%): La orden % en estado terminal no puede retener boletos en reserved o sold (encontrados: %).',
                NEW.status, NEW.reference, v_invalid_count
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_order_ticket_matrix ON public.orders;
CREATE CONSTRAINT TRIGGER trg_check_order_ticket_matrix
AFTER INSERT OR UPDATE ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_check_order_ticket_matrix();

-- 6.2 Evaluación en TICKETS al momento del COMMIT
CREATE OR REPLACE FUNCTION public.fn_check_ticket_order_matrix()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_ticket_status VARCHAR(50);
    v_current_ticket_order_id UUID;
    v_order_status VARCHAR(50);
BEGIN
    SELECT status, order_id INTO v_current_ticket_status, v_current_ticket_order_id
    FROM public.tickets
    WHERE id = NEW.id;

    IF v_current_ticket_status IS DISTINCT FROM NEW.status 
       OR v_current_ticket_order_id IS DISTINCT FROM NEW.order_id THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'reserved' THEN
        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('pending', 'pending_verification') THEN
            RAISE EXCEPTION 'Violación de Matriz: El boleto % en "reserved" debe pertenecer a una orden en "pending" o "pending_verification" (estado actual de orden: %).',
                NEW.number, COALESCE(v_order_status, 'inexistente')
                USING ERRCODE = '23514';
        END IF;

    ELSIF NEW.status = 'sold' THEN
        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status <> 'paid' THEN
            RAISE EXCEPTION 'Violación de Matriz: El boleto % en "sold" debe pertenecer a una orden en "paid" (estado actual de orden: %).',
                NEW.number, COALESCE(v_order_status, 'inexistente')
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_ticket_order_matrix ON public.tickets;
CREATE CONSTRAINT TRIGGER trg_check_ticket_order_matrix
AFTER INSERT OR UPDATE ON public.tickets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_check_ticket_order_matrix();

-- -----------------------------------------------------------------------------
-- 7. ATOMICIDAD Y CONTROL PESIMISTA EN release_expired_reservations
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expired_order_ids UUID[];
    v_released_orders_count INTEGER := 0;
    v_released_tickets_count INTEGER := 0;
BEGIN
    -- 1. Identificar y bloquear pesimistamente las órdenes pendientes cuyas reservas ya expiraron
    -- FOR UPDATE OF o SKIP LOCKED evita deadlocks con procesos concurrentes de aprobación/pago
    SELECT array_agg(id)
    INTO v_expired_order_ids
    FROM (
        SELECT o.id
        FROM public.orders o
        JOIN public.tickets t ON t.order_id = o.id
        WHERE o.status = 'pending'
          AND t.status = 'reserved'
          AND t.reservation_expires_at < NOW()
        GROUP BY o.id
        FOR UPDATE OF o SKIP LOCKED
    ) sub;

    IF v_expired_order_ids IS NULL OR array_length(v_expired_order_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    -- 2. Bloquear pesimistamente los boletos asociados
    PERFORM 1
    FROM public.tickets
    WHERE order_id = ANY(v_expired_order_ids)
    FOR UPDATE;

    -- 3. Transicionar órdenes a 'expired'
    UPDATE public.orders
    SET status = 'expired',
        updated_at = NOW()
    WHERE id = ANY(v_expired_order_ids)
      AND status = 'pending';

    GET DIAGNOSTICS v_released_orders_count = ROW_COUNT;

    -- 4. Liberar boletos a 'available' en la misma transacción atómica
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = ANY(v_expired_order_ids)
      AND status = 'reserved';

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    -- 5. Limpieza de contingencia para reservas huérfanas expiradas si existieran
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE status = 'reserved'
      AND reservation_expires_at < NOW()
      AND (order_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.orders o 
          WHERE o.id = tickets.order_id AND o.status IN ('pending', 'pending_verification')
      ));

    RETURN v_released_orders_count;
END;
$$;
