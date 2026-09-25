-- ==============================================================================
-- MIGRACIÓN 059: Corrección de agregación con FOR UPDATE en approve_order_payment
-- ==============================================================================
-- PROBLEMA IDENTIFICADO:
-- En PostgreSQL, la cláusula FOR UPDATE es incompatible con funciones agregadas (COUNT).
-- Al intentar ejecutar:
--   SELECT COUNT(*), COUNT(*) FILTER (...) FROM tickets WHERE order_id = ... FOR UPDATE;
-- El motor de PostgreSQL rechaza la transacción con:
--   ERROR: 0A000: FOR UPDATE is not allowed with aggregate functions
-- Lo que causa que PostgREST retorne un error HTTP 400 Bad Request al aprobar pagos.
--
-- SOLUCIÓN:
-- 1. Bloquear pesimistamente las filas con PERFORM 1 ... FOR UPDATE.
-- 2. Realizar el conteo de boletos sin la cláusula FOR UPDATE.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
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
            'code', 'NOT_FOUND',
            'error', 'La orden de compra no existe.'
        );
    END IF;

    -- 3. Idempotencia y validación del estado previo de la orden
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    IF v_order.status NOT IN ('pending_verification', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'No se puede aprobar la orden en su estado actual ("' || v_order.status || '"). Solo se admiten órdenes en verificación o pendientes.'
        );
    END IF;

    -- 4. INVARIANTE DB-10: Bloqueo pesimista e inspección de boletos de la orden
    -- Paso A: Bloquear las filas de boletos (sin agregación para cumplir con la sintaxis de PostgreSQL)
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- Paso B: Inspección y conteo seguro de boletos
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status NOT IN ('reserved', 'sold'))
    INTO 
        v_total_tickets,
        v_invalid_tickets
    FROM public.tickets
    WHERE order_id = p_order_id;

    -- DB-10: Una orden sin boletos NO puede pasar a paid bajo ninguna circunstancia
    IF v_total_tickets IS NULL OR v_total_tickets = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INTEGRITY_ERROR',
            'error', 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.'
        );
    END IF;

    -- Verificación de coherencia con el recuento nominal de boletos
    IF v_order.ticket_count IS NOT NULL AND v_order.ticket_count > 0 AND v_total_tickets <> v_order.ticket_count THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INTEGRITY_ERROR',
            'error', 'Discrepancia en cantidad de boletos: la orden registra ' || v_order.ticket_count || ' boletos pero se encontraron ' || v_total_tickets || ' boletos asociados.'
        );
    END IF;

    -- Verificación de estado de los boletos asociados
    IF v_invalid_tickets > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Uno o más boletos asociados a la orden se encuentran en un estado incompatible con la venta.'
        );
    END IF;

    -- 5. Transición de estados de la orden y comprobante
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
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    -- Garantía de consistencia atómica
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
