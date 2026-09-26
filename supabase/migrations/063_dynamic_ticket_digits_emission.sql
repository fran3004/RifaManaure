-- ==============================================================================
-- MIGRACIÓN 063
-- ARCHIVO: 063_dynamic_ticket_digits_emission.sql
-- Homologación dinámica estricta de dígitos y emisión completa de boletos
-- ==============================================================================
-- REGLAS DE DÍGITOS CANÓNICAS:
-- - totalTickets <= 100   => 2 cifras (00 a 99)
-- - totalTickets <= 1000  => 3 cifras (000 a 999)
-- - totalTickets <= 10000 => 4 cifras (0000 a 9999)
-- - totalTickets > 10000  => LENGTH((totalTickets - 1)::TEXT)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_raffle(
    p_title TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_total_tickets INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_slug_clean VARCHAR(100);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
    v_pad_length INTEGER := 3;
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden crear rifas.'
        );
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_slug_clean := LOWER(TRIM(COALESCE(p_slug, '')));
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa es obligatorio.');
    END IF;

    IF v_slug_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador slug es obligatorio.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio es obligatoria.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_total_tickets IS NULL OR p_total_tickets <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La emisión total de boletos debe ser mayor a 0.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.raffles WHERE slug = v_slug_clean) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe una rifa con el slug especificado: ' || v_slug_clean);
    END IF;

    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active';
    END IF;

    INSERT INTO public.raffles (
        title,
        slug,
        description,
        ticket_price,
        total_tickets,
        max_tickets_per_buyer,
        draw_date,
        lottery_reference,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_title_clean,
        v_slug_clean,
        v_desc_clean,
        p_ticket_price,
        p_total_tickets,
        p_max_tickets_per_buyer,
        p_draw_date,
        v_lottery_clean,
        p_status,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_raffle;

    -- Cálculo dinámico y estricto de dígitos de presentación y almacenamiento
    IF p_total_tickets <= 100 THEN
        v_pad_length := 2;
    ELSIF p_total_tickets <= 1000 THEN
        v_pad_length := 3;
    ELSIF p_total_tickets <= 10000 THEN
        v_pad_length := 4;
    ELSE
        v_pad_length := LENGTH((p_total_tickets - 1)::TEXT);
    END IF;

    -- Generación atómica de todos los números desde 0 hasta total_tickets - 1
    INSERT INTO public.tickets (raffle_id, number, status)
    SELECT
        v_new_raffle.id,
        LPAD(s::TEXT, v_pad_length, '0'),
        'available'
    FROM generate_series(0, p_total_tickets - 1) AS s
    ON CONFLICT (raffle_id, number) DO NOTHING;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_CREATED',
        'raffles',
        v_new_raffle.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_at', v_new_raffle.created_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;

-- Sincronizar boletos faltantes para cualquier rifa existente donde falten registros
DO $$
DECLARE
    r RECORD;
    v_pad INTEGER;
BEGIN
    FOR r IN SELECT id, total_tickets FROM public.raffles LOOP
        IF r.total_tickets IS NOT NULL AND r.total_tickets > 0 THEN
            IF r.total_tickets <= 100 THEN
                v_pad := 2;
            ELSIF r.total_tickets <= 1000 THEN
                v_pad := 3;
            ELSIF r.total_tickets <= 10000 THEN
                v_pad := 4;
            ELSE
                v_pad := LENGTH((r.total_tickets - 1)::TEXT);
            END IF;

            INSERT INTO public.tickets (raffle_id, number, status)
            SELECT
                r.id,
                LPAD(s::TEXT, v_pad, '0'),
                'available'
            FROM generate_series(0, r.total_tickets - 1) AS s
            ON CONFLICT (raffle_id, number) DO NOTHING;
        END IF;
    END LOOP;
END;
$$;
