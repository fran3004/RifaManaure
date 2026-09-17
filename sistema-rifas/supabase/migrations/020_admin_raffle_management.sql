-- ==============================================================================
-- Migración 020: Gestión Administrativa de Rifas y Sorteos (RPCs + Auditoría)
-- ==============================================================================

-- 1. Asegurar políticas RLS para la tabla raffles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'raffles' 
        AND policyname = 'Lectura pública de rifas'
    ) THEN
        CREATE POLICY "Lectura pública de rifas" 
        ON public.raffles FOR SELECT 
        TO public 
        USING (true);
    END IF;
END;
$$;

-- 2. Eliminar sobrecargas previas para evitar conflictos de firmas duplicadas (error 42725)
DROP FUNCTION IF EXISTS public.admin_update_raffle(UUID, VARCHAR, TEXT, NUMERIC, TIMESTAMPTZ, VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.admin_create_raffle(VARCHAR, VARCHAR, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT);

-- 3. Función RPC Única para Actualizar Parámetros de una Rifa (admin_update_raffle)
CREATE OR REPLACE FUNCTION public.admin_update_raffle(
    p_raffle_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT,
    p_max_tickets_per_buyer INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
BEGIN
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    -- Validar ID
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    -- Sanitizar y validar campos de texto
    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    -- Validar precio y boletos máximos
    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    -- Validar fecha de sorteo
    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    -- Validar estado
    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    -- Obtener rifa actual con bloqueo pesimista
    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe en el sistema.');
    END IF;

    -- Si se activa esta rifa, asegurar que no existan otras activas al mismo tiempo
    IF p_status = 'active' AND v_old_raffle.status <> 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE id <> p_raffle_id AND status = 'active';
    END IF;

    -- Actualizar los parámetros de la rifa
    UPDATE public.raffles
    SET title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    -- Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED',
        'raffles',
        p_raffle_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'title', v_old_raffle.title,
                'ticket_price', v_old_raffle.ticket_price,
                'draw_date', v_old_raffle.draw_date,
                'lottery_reference', v_old_raffle.lottery_reference,
                'status', v_old_raffle.status,
                'max_tickets_per_buyer', v_old_raffle.max_tickets_per_buyer
            ),
            'new_values', jsonb_build_object(
                'title', v_new_raffle.title,
                'ticket_price', v_new_raffle.ticket_price,
                'draw_date', v_new_raffle.draw_date,
                'lottery_reference', v_new_raffle.lottery_reference,
                'status', v_new_raffle.status,
                'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer
            ),
            'updated_by_admin', v_admin_id
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
            'updated_at', v_new_raffle.updated_at
        )
    );
END;
$$;

-- 4. Función RPC para Crear una Nueva Rifa con Generación Automática de Boletos (admin_create_raffle)
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
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden crear rifas.'
        );
    END IF;

    -- Sanitizar y validar
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

    IF p_total_tickets IS NULL OR p_total_tickets < 10 OR p_total_tickets > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La emisión total de boletos debe estar entre 10 y 10.000 boletos.');
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

    -- Verificar que el slug no exista
    IF EXISTS (SELECT 1 FROM public.raffles WHERE slug = v_slug_clean) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe una rifa con el slug especificado: ' || v_slug_clean);
    END IF;

    -- Si la nueva rifa entra como activa, pausar las anteriores
    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active';
    END IF;

    -- Insertar la nueva rifa
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

    -- Calcular el relleno de dígitos (3 dígitos para 1.000, 4 para 10.000, etc.)
    IF p_total_tickets > 1000 THEN
        v_pad_length := 4;
    ELSE
        v_pad_length := 3;
    END IF;

    -- Generar atómicamente todos los boletos para la nueva rifa (ej. 000 a 999)
    INSERT INTO public.tickets (raffle_id, number, status)
    SELECT
        v_new_raffle.id,
        LPAD(s::TEXT, v_pad_length, '0'),
        'available'
    FROM generate_series(0, p_total_tickets - 1) AS s
    ON CONFLICT (raffle_id, number) DO NOTHING;

    -- Registrar evento en la bitácora de auditoría
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

-- 5. Permisos de ejecución para usuarios autenticados y service_role
GRANT EXECUTE ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;
