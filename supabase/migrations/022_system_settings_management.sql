-- ==============================================================================
-- Migración 022: Gestión Dinámica de Parámetros Operativos del Sistema
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- 1. Crea la tabla public.system_settings (fila canónica id = 1)
-- 2. Habilita RLS con lectura pública y actualización restringida a administradores
-- 3. Crea la RPC admin_update_system_settings con SECURITY DEFINER y auditoría
-- 4. Actualiza reserve_tickets para leer la duración de reserva desde system_settings
-- 5. Actualiza create_order_secure para usar la duración y tope de boletos de system_settings
-- ==============================================================================

-- 1. Crear tabla de configuraciones del sistema (fila única garantizada)
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    reservation_duration_minutes INTEGER NOT NULL DEFAULT 10 CHECK (reservation_duration_minutes BETWEEN 1 AND 120),
    max_tickets_per_buyer INTEGER NOT NULL DEFAULT 20 CHECK (max_tickets_per_buyer BETWEEN 1 AND 1000),
    support_whatsapp_number VARCHAR(30) DEFAULT '573001234567',
    support_email VARCHAR(150) DEFAULT 'soporte@manaurevive.com',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Inserción inicial de valores por defecto si no existen
INSERT INTO public.system_settings (
    id,
    reservation_duration_minutes,
    max_tickets_per_buyer,
    support_whatsapp_number,
    support_email,
    updated_at
) VALUES (
    1,
    10,
    20,
    '573001234567',
    'soporte@manaurevive.com',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Habilitar RLS en public.system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de configuraciones operativas" ON public.system_settings;
CREATE POLICY "Lectura pública de configuraciones operativas"
ON public.system_settings FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Administradores pueden gestionar configuraciones operativas" ON public.system_settings;
CREATE POLICY "Administradores pueden gestionar configuraciones operativas"
ON public.system_settings FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. RPC para Actualizar Configuraciones del Sistema (admin_update_system_settings)
DROP FUNCTION IF EXISTS public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_system_settings;

CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
    p_reservation_duration_minutes INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_support_whatsapp_number TEXT,
    p_support_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_settings public.system_settings%ROWTYPE;
    v_new_settings public.system_settings%ROWTYPE;
    v_whatsapp_clean VARCHAR(30);
    v_email_clean VARCHAR(150);
BEGIN
    -- Validar privilegios administrativos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar los parámetros del sistema.'
        );
    END IF;

    -- Validaciones de rango
    IF p_reservation_duration_minutes IS NULL OR p_reservation_duration_minutes < 1 OR p_reservation_duration_minutes > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.'
        );
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer < 1 OR p_max_tickets_per_buyer > 1000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.'
        );
    END IF;

    v_whatsapp_clean := NULLIF(TRIM(p_support_whatsapp_number), '');
    v_email_clean := NULLIF(LOWER(TRIM(p_support_email)), '');

    -- Bloquear y obtener estado anterior para la bitácora
    SELECT * INTO v_old_settings
    FROM public.system_settings
    WHERE id = 1
    FOR UPDATE;

    -- Upsert canónico en id = 1
    INSERT INTO public.system_settings (
        id,
        reservation_duration_minutes,
        max_tickets_per_buyer,
        support_whatsapp_number,
        support_email,
        updated_at,
        updated_by
    ) VALUES (
        1,
        p_reservation_duration_minutes,
        p_max_tickets_per_buyer,
        v_whatsapp_clean,
        v_email_clean,
        NOW(),
        v_admin_id
    )
    ON CONFLICT (id) DO UPDATE SET
        reservation_duration_minutes = EXCLUDED.reservation_duration_minutes,
        max_tickets_per_buyer = EXCLUDED.max_tickets_per_buyer,
        support_whatsapp_number = EXCLUDED.support_whatsapp_number,
        support_email = EXCLUDED.support_email,
        updated_at = NOW(),
        updated_by = v_admin_id
    RETURNING * INTO v_new_settings;

    -- Registrar evento en la bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'SYSTEM_SETTINGS_UPDATED',
        'system_settings',
        '1',
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'reservation_duration_minutes', v_old_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_old_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_old_settings.support_whatsapp_number,
                'support_email', v_old_settings.support_email
            ),
            'new_values', jsonb_build_object(
                'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_new_settings.support_whatsapp_number,
                'support_email', v_new_settings.support_email
            )
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'settings', jsonb_build_object(
            'id', v_new_settings.id,
            'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
            'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
            'support_whatsapp_number', v_new_settings.support_whatsapp_number,
            'support_email', v_new_settings.support_email,
            'updated_at', v_new_settings.updated_at,
            'updated_by', v_new_settings.updated_by
        ),
        'message', 'Parámetros del sistema actualizados exitosamente.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- 4. Actualizar función RPC reserve_tickets para leer dinámicamente desde system_settings
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_id UUID,
    p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_sys_duration INTEGER;
    v_effective_duration INTEGER;
    v_expires_at TIMESTAMPTZ;
    v_available_count INTEGER;
    v_requested_count INTEGER := array_length(p_ticket_numbers, 1);
    v_failed_numbers TEXT[];
BEGIN
    -- Obtener la duración configurada en system_settings (por defecto 10 minutos si no existe fila)
    SELECT reservation_duration_minutes INTO v_sys_duration
    FROM public.system_settings
    WHERE id = 1;

    v_effective_duration := COALESCE(p_duration_minutes, v_sys_duration, 10);
    v_expires_at := v_now + (v_effective_duration || ' minutes')::INTERVAL;

    -- 1. Liberar cualquier reserva expirada de la rifa antes de verificar
    PERFORM public.release_expired_reservations();

    -- 2. Bloquear y verificar disponibilidad de los boletos solicitados
    WITH locked_available AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND status = 'available'
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_available;

    -- Si no todos los números solicitados están disponibles, calcular fallidos
    IF v_available_count < v_requested_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND status = 'available'
        );

        RETURN jsonb_build_object(
            'success', false,
            'reserved_count', 0,
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[]),
            'reservation_expires_at', NULL
        );
    END IF;

    -- 3. Aplicar la reserva atómica con la expiración calculada
    -- IMPORTANTE: Solo afecta a esta nueva reserva, no altera reservas ya en curso
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = v_now,
        reservation_expires_at = v_expires_at,
        buyer_id = p_buyer_id,
        updated_at = v_now
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers)
      AND status = 'available';

    RETURN jsonb_build_object(
        'success', true,
        'reserved_count', v_requested_count,
        'failed_numbers', ARRAY[]::TEXT[],
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) TO anon, authenticated, service_role;

-- 5. Actualizar función RPC create_order_secure para usar system_settings
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR(30) DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR(20) DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raffle RECORD;
    v_sys_duration INTEGER;
    v_sys_max_tickets INTEGER;
    v_allowed_max_tickets INTEGER;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ;
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    -- 1. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    -- 2. Consultar parámetros globales de system_settings
    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);
    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;

    -- 3. Consultar la rifa oficial y obtener ticket_price directamente de la base de datos
    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    -- Validar tope de boletos (prioriza el de la rifa si está seteado, o el del sistema)
    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    -- 4. Calcular total_amount exclusivamente en PostgreSQL (NUNCA desde el cliente)
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 5. Extraer y validar datos del comprador
    v_doc_id := trim(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := trim(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := trim(COALESCE(p_buyer_data->>'phone', ''));
    v_email := lower(trim(COALESCE(p_buyer_data->>'email', '')));
    v_city := trim(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Inserción segura con preservación de datos existentes
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    -- 6. Liberar reservas expiradas antes de verificar
    PERFORM public.release_expired_reservations();

    -- 7. Bloqueo atómico FOR UPDATE de boletos disponibles
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 8. Generar referencia única de orden
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    -- 9. Insertar orden con total calculado en backend
    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    -- 10. Asignar boletos a la orden con la expiración dinámica de system_settings
    -- IMPORTANTE: No toca reservas existentes de otras órdenes, solo esta nueva
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    -- 11. Registrar auditoría inmutable
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'orders',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'reservation_expires_at', v_expires_at,
            'reservation_duration_minutes', v_sys_duration
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

