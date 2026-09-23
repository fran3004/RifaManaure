-- ============================================================================
-- MIGRACIÓN 037: CORRECCIÓN TRANSACCIONAL DE APROBACIÓN Y RECHAZO DE PAGOS (DB-01 / DB-10)
-- PLATAFORMA "MANAURE VIVE" (PRODUCCIÓN VERCEL)
-- ============================================================================
-- OBJETIVOS:
-- 1. [DB-01 - CRÍTICO] Eliminar la condición peligrosa:
--    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved')
--    Tanto approve_order_payment como reject_order_payment deben operar EXCLUSIVAMENTE
--    sobre boletos con `WHERE order_id = p_order_id`, erradicando la corrupción cruzada
--    o liberación indebida de reservas pertenecientes a otras órdenes del mismo comprador.
-- 2. [DB-10 - MEDIA] Evitar que una orden sin boletos pase al estado 'paid'.
--    Validar antes de cualquier mutación que existan boletos asociados a la orden
--    (v_total_tickets > 0), que concuerden con ticket_count y que estén en estados válidos.
-- 3. Idempotencia y control de concurrencia mediante FOR UPDATE sobre órdenes y boletos.
-- 4. Preservación estricta de SECURITY DEFINER, search_path = public, pg_temp,
--    validación administrativa is_admin(auth.uid()) y grants restringidos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROCEDIMIENTO: approve_order_payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_total_tickets INTEGER;
    v_invalid_tickets INTEGER;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Bloqueo pesimista de la fila de la orden para serializar aprobaciones concurrentes
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

    -- 3. Idempotencia y validación del estado previo de la orden
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    IF v_order.status NOT IN ('pending_verification', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede aprobar la orden porque su estado actual es "' || v_order.status || '". Solo se admiten órdenes en verificación o pendientes.'
        );
    END IF;

    -- 4. INVARIANTE DB-10: Bloqueo e inspección de boletos pertenecientes a la orden
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status NOT IN ('reserved', 'sold'))
    INTO 
        v_total_tickets,
        v_invalid_tickets
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- DB-10: Una orden sin boletos NO puede pasar a paid bajo ninguna circunstancia
    IF v_total_tickets IS NULL OR v_total_tickets = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.'
        );
    END IF;

    -- Verificación de coherencia con el recuento nominal de boletos
    IF v_order.ticket_count IS NOT NULL AND v_order.ticket_count > 0 AND v_total_tickets <> v_order.ticket_count THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Discrepancia en cantidad de boletos: la orden registra ' || v_order.ticket_count || ' boletos pero se encontraron ' || v_total_tickets || ' boletos asociados.'
        );
    END IF;

    -- Verificación de estado de los boletos asociados
    IF v_invalid_tickets > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más boletos asociados a la orden se encuentran en un estado incompatible con la venta.'
        );
    END IF;

    -- 5. Transición de estados de la orden y comprobante
    -- Se actualiza primero la orden a 'paid' para cumplir con el trigger trg_validate_ticket_status
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. INVARIANTE DB-01: Actualizar EXCLUSIVAMENTE los boletos de p_order_id
    -- Condición eliminada: OR (buyer_id = v_order.buyer_id AND status = 'reserved')
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    -- Garantía de consistencia atómica: si por carrera concurrente no se actualizaron todos, abortar
    IF v_updated_tickets_count <> v_total_tickets THEN
        RAISE EXCEPTION 'Fallo de consistencia atómica: se esperaba actualizar % boletos pero se afectaron %.',
            v_total_tickets, v_updated_tickets_count;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. PROCEDIMIENTO: reject_order_payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_reason TEXT;
    v_released_tickets_count INTEGER;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador'
            USING ERRCODE = '42501';
    END IF;

    v_clean_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Comprobante no válido o transferencia no confirmada');

    -- 2. Bloqueo pesimista de la fila de la orden para serializar rechazos concurrentes
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

    -- 3. Idempotencia y validación del estado previo de la orden
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    IF v_order.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra rechazada anteriormente.'
        );
    END IF;

    IF v_order.status IN ('expired', 'cancelled', 'refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden en estado "' || v_order.status || '" no puede ser rechazada.'
        );
    END IF;

    -- 4. Bloquear los boletos de esta orden exclusivamente
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 5. Transición de estados de la orden y comprobante
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. INVARIANTE DB-01: Liberar EXCLUSIVAMENTE los boletos pertenecientes a p_order_id
    -- Condición eliminada: OR (buyer_id = v_order.buyer_id AND status = 'reserved')
    -- Las reservas de otras órdenes del mismo comprador quedan estrictamente protegidas
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;
