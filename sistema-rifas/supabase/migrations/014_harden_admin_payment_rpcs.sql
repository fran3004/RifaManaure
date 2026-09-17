-- ============================================================================
-- MIGRACIÓN 014: ENDURECIMIENTO DE SEGURIDAD EN RPCS ADMINISTRATIVAS DE PAGO
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- 1. Agrega validación estricta is_admin(auth.uid()) al inicio de approve_order_payment
--    y reject_order_payment.
-- 2. Elimina el parámetro p_admin_id recibido desde el cliente y usa auth.uid()
--    directamente en el servidor como identidad del administrador.
-- 3. Mantiene intacta la lógica transaccional (FOR UPDATE, transiciones y boletos).
-- 4. Revoca permisos de ejecución a anon / PUBLIC y confirma GRANT a authenticated y service_role.
-- ============================================================================

-- 1. Eliminar firmas anteriores con sobrecarga de parámetros (p_admin_id)
DROP FUNCTION IF EXISTS public.approve_order_payment(UUID, UUID);
DROP FUNCTION IF EXISTS public.approve_order_payment(UUID);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_order_payment(UUID);

-- 2. Procedimiento Seguro: Aprobar Pago de Orden (Solo Administrador)
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    -- 1. Validación estricta de autorización de administrador
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Bloqueo pesimista de la orden para evitar condiciones de carrera
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

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    -- 3. Actualizar orden a 'paid'
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 4. Actualizar comprobante(s) asociado(s) a 'approved'
    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 5. Marcar boletos como vendidos definitivamente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

-- 3. Procedimiento Seguro: Rechazar Pago de Orden y Liberar Boletos (Solo Administrador)
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    -- 1. Validación estricta de autorización de administrador
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Bloqueo pesimista de la orden
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

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    -- 3. Actualizar orden a 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 4. Actualizar comprobante(s) a 'rejected' con el motivo
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 5. Liberar boletos de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

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

-- 4. Control de Privilegios: Revocar de anon/PUBLIC y Conceder exclusivamente a authenticated y service_role
REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;

