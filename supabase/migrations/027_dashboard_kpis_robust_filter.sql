-- ============================================================================
-- MIGRACIÓN 027: MEJORA ROBUSTA DEL FILTRADO POR RAFFLE_ID EN GET_DASHBOARD_KPIS
-- ============================================================================
-- Garantiza que al consultar una rifa específica (p_raffle_id), si sus boletos
-- aún no han sido generados en la tabla tickets, el total de boletos se obtenga
-- de la configuración de public.raffles.total_tickets.

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
    p_raffle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_tickets_result RECORD;
    v_orders_result RECORD;
    v_total_buyers BIGINT;
    v_total_tickets BIGINT;
    v_tickets_sold BIGINT;
    v_tickets_available BIGINT;
    v_tickets_reserved BIGINT;
    v_tickets_blocked BIGINT;
    v_percentage_sold NUMERIC;
BEGIN
    -- 1. Verificación de seguridad: solo administradores autorizados
    IF v_admin_uid IS NULL OR NOT public.is_admin(v_admin_uid) THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores autorizados pueden consultar métricas operativas.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Agregaciones nativas sobre la tabla tickets filtradas por p_raffle_id
    SELECT
        COUNT(*)::BIGINT AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'sold')::BIGINT AS tickets_sold,
        COUNT(*) FILTER (WHERE status = 'available')::BIGINT AS tickets_available,
        COUNT(*) FILTER (WHERE status = 'reserved')::BIGINT AS tickets_reserved,
        COUNT(*) FILTER (WHERE status = 'blocked')::BIGINT AS tickets_blocked
    INTO v_tickets_result
    FROM public.tickets
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    v_total_tickets := COALESCE(v_tickets_result.total_tickets, 0);
    v_tickets_sold := COALESCE(v_tickets_result.tickets_sold, 0);
    v_tickets_available := COALESCE(v_tickets_result.tickets_available, 0);
    v_tickets_reserved := COALESCE(v_tickets_result.tickets_reserved, 0);
    v_tickets_blocked := COALESCE(v_tickets_result.tickets_blocked, 0);

    -- Si no hay boletos creados para la rifa seleccionada, consultar la definición de la rifa
    IF v_total_tickets = 0 THEN
        IF p_raffle_id IS NOT NULL THEN
            SELECT COALESCE(total_tickets, 1000) INTO v_total_tickets
            FROM public.raffles
            WHERE id = p_raffle_id;
            v_total_tickets := COALESCE(v_total_tickets, 1000);
            v_tickets_available := v_total_tickets;
        ELSE
            v_total_tickets := 1000;
            v_tickets_available := 1000;
        END IF;
    END IF;

    IF v_total_tickets > 0 THEN
        v_percentage_sold := ROUND((v_tickets_sold::NUMERIC / v_total_tickets::NUMERIC) * 100, 2);
    ELSE
        v_percentage_sold := 0;
    END IF;

    -- 3. Agregaciones nativas sobre la tabla orders
    SELECT
        COUNT(*)::BIGINT AS total_orders_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid', 'completed')), 0)::NUMERIC AS confirmed_money,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'pending_verification'), 0)::NUMERIC AS pending_verification_money,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_orders_count,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::BIGINT AS pending_receipts_count,
        COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::BIGINT AS paid_orders_count,
        COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT AS rejected_orders_count,
        COUNT(*) FILTER (WHERE status = 'expired')::BIGINT AS expired_orders_count,
        COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled_orders_count,
        COUNT(*) FILTER (WHERE status = 'refunded')::BIGINT AS refunded_orders_count,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_orders_count
    INTO v_orders_result
    FROM public.orders
    WHERE (p_raffle_id IS NULL OR raffle_id = p_raffle_id);

    -- 4. Conteo de compradores (total de compradores únicos si es por rifa, o tabla buyers si es global)
    IF p_raffle_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT buyer_id)::BIGINT
        INTO v_total_buyers
        FROM public.orders
        WHERE raffle_id = p_raffle_id;
    ELSE
        SELECT COUNT(*)::BIGINT
        INTO v_total_buyers
        FROM public.buyers;
    END IF;

    -- 5. Retornar objeto JSONB consolidado con ambas nomenclaturas (camelCase y snake_case)
    RETURN jsonb_build_object(
        'totalTickets', v_total_tickets,
        'ticketsAvailable', v_tickets_available,
        'ticketsReserved', v_tickets_reserved,
        'ticketsSold', v_tickets_sold,
        'ticketsBlocked', v_tickets_blocked,
        'percentageSold', v_percentage_sold,
        'pendingOrdersCount', COALESCE(v_orders_result.pending_orders_count, 0),
        'pendingReceiptsCount', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paidOrdersCount', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejectedOrdersCount', COALESCE(v_orders_result.rejected_orders_count, 0),
        'expiredOrdersCount', COALESCE(v_orders_result.expired_orders_count, 0),
        'cancelledOrdersCount', COALESCE(v_orders_result.cancelled_orders_count, 0),
        'refundedOrdersCount', COALESCE(v_orders_result.refunded_orders_count, 0),
        'totalOrdersCount', COALESCE(v_orders_result.total_orders_count, 0),
        'confirmedMoney', COALESCE(v_orders_result.confirmed_money, 0),
        'pendingVerificationMoney', COALESCE(v_orders_result.pending_verification_money, 0),
        'totalBuyersCount', COALESCE(v_total_buyers, 0),
        'totalCollected', COALESCE(v_orders_result.confirmed_money, 0),
        'ordersByStatus', jsonb_build_object(
            'pending', COALESCE(v_orders_result.pending_orders_count, 0),
            'pending_verification', COALESCE(v_orders_result.pending_receipts_count, 0),
            'paid', COALESCE(v_orders_result.paid_orders_count, 0),
            'completed', COALESCE(v_orders_result.completed_orders_count, 0),
            'rejected', COALESCE(v_orders_result.rejected_orders_count, 0),
            'expired', COALESCE(v_orders_result.expired_orders_count, 0),
            'cancelled', COALESCE(v_orders_result.cancelled_orders_count, 0),
            'refunded', COALESCE(v_orders_result.refunded_orders_count, 0)
        ),
        'total_tickets', v_total_tickets,
        'tickets_available', v_tickets_available,
        'tickets_reserved', v_tickets_reserved,
        'tickets_sold', v_tickets_sold,
        'tickets_blocked', v_tickets_blocked,
        'percentage_sold', v_percentage_sold,
        'pending_orders_count', COALESCE(v_orders_result.pending_orders_count, 0),
        'pending_receipts_count', COALESCE(v_orders_result.pending_receipts_count, 0),
        'paid_orders_count', COALESCE(v_orders_result.paid_orders_count, 0),
        'rejected_orders_count', COALESCE(v_orders_result.rejected_orders_count, 0),
        'confirmed_money', COALESCE(v_orders_result.confirmed_money, 0),
        'pending_verification_money', COALESCE(v_orders_result.pending_verification_money, 0),
        'total_buyers_count', COALESCE(v_total_buyers, 0),
        'total_collected', COALESCE(v_orders_result.confirmed_money, 0)
    );
END;
$$;

-- Permisos estrictos de ejecución
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID) TO authenticated, service_role;

