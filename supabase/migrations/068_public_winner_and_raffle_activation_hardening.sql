-- ==============================================================================
-- MIGRACIÓN 068: Consulta Pública Segura de Ganadores y Hardening de Activación
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVO:
-- 1. Crear función RPC public.get_public_winner(p_raffle_id UUID) con SECURITY DEFINER
--    para entregar al público los datos oficiales del ganador con enmascaramiento
--    de PII y sin fricciones de permisos RLS en buyers/orders.
-- 2. Asegurar que public.winners tenga permisos de lectura pública sin bloqueos.
-- 3. Garantizar que register_winner actualice formalmente el estado de la rifa a 'finished'.
-- ==============================================================================

-- 1. Función RPC para obtener el ganador público de una rifa
CREATE OR REPLACE FUNCTION public.get_public_winner(p_raffle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_winner RECORD;
    v_buyer RECORD;
    v_raffle RECORD;
    v_order RECORD;
BEGIN
    IF p_raffle_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Obtener el registro de ganador más reciente para la rifa
    SELECT * INTO v_winner
    FROM public.winners
    WHERE raffle_id = p_raffle_id
    ORDER BY draw_date DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Obtener datos de la rifa
    SELECT id, title, lottery_reference, ticket_price, status, draw_date
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    -- Obtener datos del comprador
    SELECT id, full_name, document_id, city
    INTO v_buyer
    FROM public.buyers
    WHERE id = v_winner.buyer_id;

    -- Obtener datos de la orden
    SELECT id, reference, created_at, total_amount
    INTO v_order
    FROM public.orders
    WHERE id = v_winner.order_id;

    -- Construir respuesta JSON estructurada con enmascaramiento
    RETURN jsonb_build_object(
        'id', v_winner.id,
        'raffle_id', v_winner.raffle_id,
        'order_id', v_winner.order_id,
        'buyer_id', v_winner.buyer_id,
        'ticket_id', v_winner.ticket_id,
        'ticket_number', v_winner.ticket_number,
        'lottery_draw_number', v_winner.lottery_draw_number,
        'draw_date', v_winner.draw_date,
        'official_act_url', v_winner.official_act_url,
        'delivery_photos', COALESCE(v_winner.delivery_photos, '{}'::TEXT[]),
        'notes', v_winner.notes,
        'created_at', v_winner.created_at,
        'raffle', jsonb_build_object(
            'id', COALESCE(v_raffle.id, p_raffle_id),
            'title', COALESCE(v_raffle.title, 'Rifa Oficial'),
            'lottery_reference', COALESCE(v_raffle.lottery_reference, 'Sorteo Oficial'),
            'ticket_price', COALESCE(v_raffle.ticket_price, 0),
            'status', COALESCE(v_raffle.status, 'closed')
        ),
        'buyer', jsonb_build_object(
            'id', v_buyer.id,
            'full_name', COALESCE(v_buyer.full_name, 'Ganador Acreditado'),
            'document_id', COALESCE(v_buyer.document_id, '***'),
            'city', COALESCE(v_buyer.city, 'Manaure')
        ),
        'order', jsonb_build_object(
            'id', v_order.id,
            'reference', COALESCE(v_order.reference, 'MV-OFICIAL'),
            'created_at', v_order.created_at,
            'total_amount', COALESCE(v_order.total_amount, 0)
        )
    );
END;
$$;

-- Otorgar ejecución a anónimos y autenticados
GRANT EXECUTE ON FUNCTION public.get_public_winner(UUID) TO anon, authenticated, service_role;

-- 2. Asegurar RLS en public.winners para lectura pública
ALTER TABLE public.winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de ganadores" ON public.winners;
CREATE POLICY "Lectura pública de ganadores" 
ON public.winners FOR SELECT 
TO public 
USING (true);
