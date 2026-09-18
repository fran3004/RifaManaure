-- ============================================================================
-- MIGRACIÓN 004: NORMALIZACIÓN Y REGLAS DE INTEGRIDAD DEL FLUJO DE ESTADOS
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Asegurar Tabla de Auditoría
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    performed_by UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs;
CREATE POLICY "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 2. Normalización de Restricciones en public.orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN (
        'pending',              -- 1. Reserva temporal creada (10 min)
        'pending_verification', -- 2. Usuario subió comprobante (protegido)
        'paid',                 -- 3. Aprobado por administrador (tickets sold)
        'completed',            -- Compatibilidad histórica (equivalente a paid)
        'rejected',             -- 4. Rechazado por administrador (tickets available)
        'expired',              -- 5. Tiempo de reserva expiró sin comprobante
        'cancelled',            -- 6. Cancelada por usuario o administración
        'refunded'              -- 7. Reembolso excepcional
    ));

-- 3. Normalización de Restricciones en public.tickets
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check 
    CHECK (status IN ('available', 'reserved', 'sold', 'blocked'));

-- ============================================================================
-- TRIGGERS DE INTEGRIDAD Y TRANSICIÓN DE ESTADOS (ANTI-BYPASS FRONTEND)
-- ============================================================================

-- A. Función Trigger: Validación de Transiciones de Órdenes y Registro en Auditoría
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si el estado no cambió, continuar
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid'/'completed' sin comprobante
    IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir revertir una orden 'paid' o 'completed' a 'pending' o 'pending_verification'
    IF OLD.status IN ('paid', 'completed') AND NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
    END IF;

    -- REGLA 3: No permitir que órdenes 'expired', 'rejected' o 'cancelled' pasen a 'paid' directamente
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status IN ('paid', 'completed') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- REGISTRO AUTOMÁTICO EN AUDIT_LOGS
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

DROP TRIGGER IF EXISTS trg_validate_order_status ON public.orders;
CREATE TRIGGER trg_validate_order_status
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_order_status_transition();

-- B. Función Trigger: Validación de Transiciones de Boletos (No permitir pending -> sold directo)
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_status VARCHAR(50);
BEGIN
    -- Si el estado no cambió, continuar
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA DE ORO DE SEGURIDAD:
    -- Ningún boleto puede marcarse como 'sold' si no está vinculado a una orden en estado 'paid' o 'completed'
    IF NEW.status = 'sold' THEN
        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('paid', 'completed') THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid".', 
                NEW.number, NEW.order_id, COALESCE(v_order_status, 'inexistente');
        END IF;
    END IF;

    -- Si el boleto pasa a 'available', garantizar que se limpien reservas y referencias
    IF NEW.status = 'available' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Registro en auditoría para ventas o liberaciones de boletos
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
                'order_id', COALESCE(NEW.order_id, OLD.order_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_ticket_status ON public.tickets;
CREATE TRIGGER trg_validate_ticket_status
    BEFORE UPDATE OF status ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_ticket_status_transition();

-- ============================================================================
-- PROCEDIMIENTOS TRANSACCIONALES BACKEND DEFINITIVOS
-- ============================================================================

-- 1. USUARIO SUBE COMPROBANTE -> pending_verification
CREATE OR REPLACE FUNCTION public.submit_order_receipt(
    p_order_id UUID,
    p_receipt_url TEXT,
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra en estado ' || v_order.status || ' y no acepta comprobantes.'
        );
    END IF;

    -- Actualizar orden a pending_verification
    UPDATE public.orders
    SET receipt_url = p_receipt_url,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Asegurar que los tickets sigan asociados
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante recibido exitosamente. La orden queda en verificación y los tickets protegidos.'
    );
END;
$$;

-- 2. ADMIN APRUEBA PAGO -> order: paid, tickets: sold
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_sold INTEGER;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Esta orden ya fue aprobada y pagada previamente.'
        );
    END IF;

    -- 1. Primero marcar la orden como 'paid' (para cumplir con el trigger de tickets)
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Luego actualizar tickets a 'sold'
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        buyer_id = v_order.buyer_id,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_sold = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold', v_tickets_sold,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos.'
    );
END;
$$;

-- 3. ADMIN RECHAZA PAGO -> order: rejected, tickets: available
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no coincide con la transferencia bancaria',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    -- Bloqueo FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede rechazar una orden que ya fue pagada y confirmada.'
        );
    END IF;

    -- 1. Marcar orden como 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 2. Liberar boletos asociados de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'tickets_released', v_tickets_released,
        'message', 'Orden rechazada y boletos liberados exitosamente.'
    );
END;
$$;

-- 4. CANCELACIÓN DE ORDEN (Usuario o Timeout) -> order: cancelled, tickets: available
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación por el usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada.');
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede cancelar una orden ya pagada.');
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled',
        'tickets_released', v_tickets_released
    );
END;
$$;

-- 5. LIBERACIÓN AUTOMÁTICA DE RESERVAS EXPIRADAS (Protege pending_verification)
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    -- Liberar solo boletos expirados cuya orden NO esté en pending_verification, paid ni completed
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          t.order_id IS NULL 
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    -- Marcar como 'expired' las órdenes en 'pending' cuyos tickets hayan sido liberados
    UPDATE public.orders o
    SET status = 'expired',
        updated_at = NOW()
    WHERE o.status = 'pending'
      AND NOT EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.order_id = o.id AND t.status = 'reserved'
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;

