-- ====================================================================
-- MIGRACIÓN 043: Blindaje de cancel_order y Eliminación de IDOR (SEC-03)
-- ====================================================================
-- Hallazgo: SEC-03 (Severidad: ALTA)
--
-- Contexto:
-- La función `public.cancel_order` permitía la cancelación de órdenes sin validar
-- la titularidad del comprador (quien no posee cuenta de Supabase Auth) ni exigir
-- rol administrativo. Esto exponía una vulnerabilidad de IDOR (Insecure Direct
-- Object Reference), donde cualquier usuario con token `authenticated` podía cancelar
-- órdenes ajenas conociendo o deduciendo el UUID de la orden.
--
-- Decisión Arquitectónica:
-- 1. Dado que los compradores no poseen cuenta ni sesión en Supabase Auth,
--    la cancelación de órdenes es una operación EXCLUSIVAMENTE ADMINISTRATIVA.
-- 2. Se exige validación estricta mediante `public.is_admin(v_admin_id)`.
-- 3. Se bloquea de forma pesimista la fila de la orden (`FOR UPDATE`) y sus boletos
--    asociados para garantizar atomicidad y prevenir condiciones de carrera con
--    aprobaciones, rechazos o expiraciones concurrentes.
-- 4. Idempotencia: si la orden ya está cancelada, retorna éxito sin error.
-- 5. Invariantes de estado: prohíbe cancelar órdenes ya pagadas (`paid`/`completed`)
--    o ya rechazadas (`rejected`).
-- 6. Ámbito de liberación: libera estricta y únicamente los boletos de `p_order_id`.
-- 7. Revocación de permisos: REVOKE EXECUTE a `PUBLIC` y `anon`.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación administrativa de orden'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_reason TEXT;
    v_tickets_released INTEGER := 0;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa (SEC-03)
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador para cancelar órdenes'
            USING ERRCODE = '42501';
    END IF;

    v_clean_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelación administrativa de orden');

    -- 2. Bloqueo pesimista de la fila de la orden para serializar operaciones concurrentes
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

    -- 3. Idempotencia y validación de la máquina de estados
    IF v_order.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'status', 'cancelled',
            'already_cancelled', true,
            'tickets_released', 0,
            'message', 'La orden ya se encontraba cancelada anteriormente.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede cancelar una orden que ya fue pagada y confirmada.'
        );
    END IF;

    IF v_order.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede cancelar una orden que ya fue rechazada.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Estado de orden no cancelable: "' || v_order.status || '". Solo se pueden cancelar órdenes en estado pending o pending_verification.'
        );
    END IF;

    -- 4. Bloqueo pesimista de boletos pertenecientes a esta orden exclusivamente
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 5. Transición de la orden a 'cancelled' (dispara trg_validate_order_status y audit_logs)
    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = v_clean_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Si existe comprobante asociado, actualizar su estado para coherencia operativa
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. Liberar EXCLUSIVAMENTE los boletos asociados a esta orden
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
        'tickets_released', v_tickets_released,
        'message', 'Orden cancelada y boletos liberados exitosamente.'
    );
END;
$$;

-- 7. Revocar permisos de ejecución a PUBLIC y anon; conceder a authenticated y service_role
REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO authenticated, service_role;

-- 8. Documentación en catálogo
COMMENT ON FUNCTION public.cancel_order(UUID, TEXT) IS 
'Cancela una orden de forma atómica y segura, liberando únicamente sus boletos. Requiere privilegios de administrador verificados mediante is_admin (SEC-03).';
