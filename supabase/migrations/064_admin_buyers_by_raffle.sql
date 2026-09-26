-- ==============================================================================
-- MIGRACIÓN 064: Consulta aislada y optimizada de compradores por rifa
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVO:
-- Garantizar que en el panel administrativo la gestión de compradores esté
-- estrictamente vinculada a la rifa activa/seleccionada. No debe haber mezcla
-- de compradores de otras rifas. Las métricas (órdenes, total gastado, boletos)
-- deben calcularse de forma exclusiva para la rifa en cuestión.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_buyers_by_raffle(
    p_raffle_id UUID,
    p_search TEXT DEFAULT '',
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_search TEXT := TRIM(COALESCE(p_search, ''));
    v_result JSONB;
BEGIN
    -- 1. Verificación estricta de autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Si no se suministra ID de rifa, retornar conjunto vacío
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'total_count', 0,
            'buyers', '[]'::jsonb
        );
    END IF;

    -- 3. Consulta de agregados por comprador para la rifa especificada
    WITH raffle_buyer_stats AS (
        SELECT 
            o.buyer_id,
            COUNT(o.id)::INTEGER AS total_orders_count,
            COUNT(o.id) FILTER (WHERE o.status = 'paid')::INTEGER AS paid_orders_count,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'paid'), 0)::NUMERIC AS total_spent,
            COALESCE(SUM(o.ticket_count) FILTER (WHERE o.status = 'paid'), 0)::INTEGER AS total_tickets,
            MAX(o.created_at) AS last_order_at
        FROM public.orders o
        WHERE o.raffle_id = p_raffle_id
        GROUP BY o.buyer_id
    ),
    filtered_buyers AS (
        SELECT 
            b.id,
            b.full_name,
            b.document_id,
            b.phone,
            b.email,
            b.city,
            b.created_at,
            b.updated_at,
            rbs.total_orders_count,
            rbs.paid_orders_count,
            rbs.total_spent,
            rbs.total_tickets,
            rbs.last_order_at,
            COUNT(*) OVER()::INTEGER AS full_count
        FROM raffle_buyer_stats rbs
        JOIN public.buyers b ON b.id = rbs.buyer_id
        WHERE (
            v_search = '' OR
            b.document_id ILIKE '%' || v_search || '%' OR
            b.full_name ILIKE '%' || v_search || '%' OR
            b.phone ILIKE '%' || v_search || '%' OR
            b.email ILIKE '%' || v_search || '%' OR
            b.city ILIKE '%' || v_search || '%'
        )
        ORDER BY rbs.last_order_at DESC, b.created_at DESC
        LIMIT GREATEST(1, p_limit)
        OFFSET GREATEST(0, p_offset)
    )
    SELECT 
        jsonb_build_object(
            'success', true,
            'total_count', COALESCE((SELECT fb.full_count FROM filtered_buyers fb LIMIT 1), 0),
            'buyers', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', fb.id,
                            'full_name', fb.full_name,
                            'document_id', fb.document_id,
                            'phone', fb.phone,
                            'email', fb.email,
                            'city', fb.city,
                            'created_at', fb.created_at,
                            'updated_at', fb.updated_at,
                            'total_orders_count', fb.total_orders_count,
                            'paid_orders_count', fb.paid_orders_count,
                            'total_spent', fb.total_spent,
                            'total_tickets', fb.total_tickets
                        )
                    )
                    FROM filtered_buyers fb
                ),
                '[]'::jsonb
            )
        ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Permisos de ejecución para usuarios autenticados (la validación interna revisa is_admin)
GRANT EXECUTE ON FUNCTION public.admin_get_buyers_by_raffle(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
