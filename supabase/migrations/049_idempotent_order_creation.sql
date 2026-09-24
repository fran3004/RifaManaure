-- ==============================================================================
-- MIGRACIÓN 049: Idempotencia Transaccional en Creación de Órdenes (Auditoría 03)
--
-- HALLAZGO:
-- Falta de idempotencia en public.create_order_secure:
-- Peticiones duplicadas (doble clic, reintentos de red, timeouts post-commit)
-- creaban múltiples órdenes pendientes y reasignaban boletos de órdenes previas
-- del mismo comprador, dejando órdenes huérfanas sin boletos (ej. MV-D3BE1DC2).
--
-- REMEDIACIÓN IMPLEMENTADA:
-- 1. Columna client_idempotency_key UUID UNIQUE NOT NULL en public.orders.
--    - Backfill determinista con gen_random_uuid() para órdenes históricas.
-- 2. Columna idempotency_fingerprint VARCHAR(64) para almacenar huella SHA-256
--    de los parámetros de la operación calculada exclusivamente en el servidor.
-- 3. Blindaje en public.create_order_secure:
--    - p_client_idempotency_key UUID DEFAULT NULL.
--    - Bloqueo transaccional advisory (pg_advisory_xact_lock) por clave.
--    - Detección inmediata de orden previa con misma clave:
--      * Mismo fingerprint -> Retorna orden existente (idempotency_replayed = true).
--      * Distinto fingerprint -> Error controlado 'IDEMPOTENCY_CONFLICT'.
--    - Erradicación de la cláusula 'OR (status = reserved AND buyer_id = ...)'
--      en la reserva pesimista: NINGUNA orden puede robar boletos de otra orden.
--    - Bloqueo de excepción en colisión unique_violation por concurrencia extrema.
--    - Registro de clave y fingerprint en audit_logs.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: MODIFICACIÓN ESTRUCTURAL DE TABLA PUBLIC.ORDERS
-- ==============================================================================

-- 1.1 Agregar columnas para idempotencia y huella criptográfica
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS client_idempotency_key UUID,
ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

-- 1.2 Backfill de órdenes históricas existentes que carezcan de clave
UPDATE public.orders 
SET client_idempotency_key = gen_random_uuid() 
WHERE client_idempotency_key IS NULL;

-- 1.3 Asignar DEFAULT y NOT NULL tras el saneamiento de registros históricos
ALTER TABLE public.orders 
ALTER COLUMN client_idempotency_key SET DEFAULT gen_random_uuid(),
ALTER COLUMN client_idempotency_key SET NOT NULL;

-- 1.4 Crear índice único estricto para garantizar unicidad a nivel de motor
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_idempotency_key 
ON public.orders (client_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_orders_idempotency_fingerprint 
ON public.orders (idempotency_fingerprint);


-- ==============================================================================
-- SECCIÓN 2: REEMPLAZO DE LA RPC CREATE_ORDER_SECURE CON IDEMPOTENCIA TOTAL
-- ==============================================================================

-- 2.1 Eliminar la firma anterior de 5 parámetros para evitar sobrecargas ambiguas (42725)
DROP FUNCTION IF EXISTS public.create_order_secure(uuid, text[], jsonb, character varying, character varying);

-- 2.2 Crear la nueva función con 6 parámetros (el sexto opcional con DEFAULT NULL)
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR(30) DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR(20) DEFAULT 'both',
    p_client_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
    v_payment_method VARCHAR(30);
    v_contact_preference VARCHAR(20);
    v_sorted_tickets TEXT[];
    v_idempotency_key UUID;
    v_fingerprint_source TEXT;
    v_calculated_fingerprint VARCHAR(64);
    v_existing_order public.orders%ROWTYPE;
    v_existing_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Validaciones básicas de parámetros requeridos
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    IF p_ticket_numbers IS NULL OR array_length(p_ticket_numbers, 1) IS NULL OR array_length(p_ticket_numbers, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    -- Normalizar y ordenar boletos únicos para consistencia determinista
    SELECT ARRAY(
        SELECT DISTINCT TRIM(t)
        FROM unnest(p_ticket_numbers) t
        WHERE TRIM(t) <> ''
        ORDER BY 1
    ) INTO v_sorted_tickets;

    v_ticket_count := COALESCE(array_length(v_sorted_tickets, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto válido.');
    END IF;

    -- Normalizar y sanear datos del comprador
    v_doc_id := UPPER(TRIM(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', '')));
    v_full_name := TRIM(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := TRIM(COALESCE(p_buyer_data->>'phone', ''));
    v_email := LOWER(TRIM(COALESCE(p_buyer_data->>'email', '')));
    v_city := TRIM(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Normalizar método de pago y canal de contacto
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'transfer_manual')));
    v_contact_preference := LOWER(TRIM(COALESCE(p_contact_preference, 'both')));

    -- 2. Resolver llave de idempotencia y calcular huella criptográfica (SHA-256)
    IF p_client_idempotency_key IS NOT NULL THEN
        v_idempotency_key := p_client_idempotency_key;
    ELSE
        v_idempotency_key := gen_random_uuid();
    END IF;

    v_fingerprint_source := p_raffle_id::TEXT || '|' ||
                            array_to_string(v_sorted_tickets, ',') || '|' ||
                            v_doc_id || '|' ||
                            v_payment_method || '|' ||
                            v_contact_preference;
    v_calculated_fingerprint := encode(digest(v_fingerprint_source, 'sha256'), 'hex');

    -- 3. Bloqueo transaccional advisory por llave de idempotencia para serializar llamadas concurrentes
    PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key::TEXT));

    -- 4. Verificar si ya existe una orden registrada con esta llave de idempotencia
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE client_idempotency_key = v_idempotency_key;

    IF v_existing_order.id IS NOT NULL THEN
        -- Validar si la huella de parámetros coincide exactamente
        IF v_existing_order.idempotency_fingerprint IS NOT NULL 
           AND v_existing_order.idempotency_fingerprint <> v_calculated_fingerprint THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Conflicto de idempotencia: La clave suministrada ya fue utilizada para una orden con parámetros diferentes.',
                'code', 'IDEMPOTENCY_CONFLICT'
            );
        END IF;

        -- Mismo payload: retornar la orden existente sin tocar boletos ni duplicar registros
        SELECT MAX(reservation_expires_at) INTO v_existing_expires_at
        FROM public.tickets
        WHERE order_id = v_existing_order.id;

        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_existing_order.id,
            'reference', v_existing_order.reference,
            'buyer_id', v_existing_order.buyer_id,
            'total_amount', v_existing_order.total_amount,
            'ticket_count', v_existing_order.ticket_count,
            'reservation_expires_at', COALESCE(v_existing_expires_at, v_existing_order.created_at + INTERVAL '15 minutes'),
            'idempotency_replayed', true
        );
    END IF;

    -- 5. Creación de nueva orden: Validaciones operativas y de rifa
    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);
    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;

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

    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- Registrar o actualizar datos del comprador
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        city = EXCLUDED.city,
        updated_at = NOW()
    RETURNING id INTO v_buyer_id;

    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id FROM public.buyers WHERE document_id = v_doc_id;
    END IF;

    -- Liberar reservas expiradas antes de evaluar disponibilidad de boletos
    PERFORM public.release_expired_reservations();

    -- 6. Bloqueo pesimista FOR UPDATE: SOLO boletos en estado 'available'
    -- REGLA DE INTEGRIDAD AUDITORÍA 03: Ninguna orden puede robar boletos ya reservados por otra orden.
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(v_sorted_tickets)
          AND status = 'available'
        FOR UPDATE
    )
    SELECT count(*) INTO v_available_count
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(v_sorted_tickets) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(v_sorted_tickets)
              AND status = 'available'
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 7. Crear la orden con idempotencia y huella criptográfica
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    BEGIN
        INSERT INTO public.orders (
            raffle_id,
            buyer_id,
            reference,
            total_amount,
            ticket_count,
            status,
            payment_method,
            contact_preference,
            client_idempotency_key,
            idempotency_fingerprint
        ) VALUES (
            p_raffle_id,
            v_buyer_id,
            v_reference,
            v_total_amount,
            v_ticket_count,
            'pending',
            v_payment_method,
            v_contact_preference,
            v_idempotency_key,
            v_calculated_fingerprint
        )
        RETURNING id INTO v_order_id;
    EXCEPTION
        WHEN unique_violation THEN
            -- Manejo defensivo en concurrencia extrema que coincida en la clave única
            SELECT * INTO v_existing_order
            FROM public.orders
            WHERE client_idempotency_key = v_idempotency_key;

            IF v_existing_order.id IS NOT NULL THEN
                IF v_existing_order.idempotency_fingerprint <> v_calculated_fingerprint THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Conflicto de idempotencia: La clave suministrada ya fue utilizada para una orden con parámetros diferentes.',
                        'code', 'IDEMPOTENCY_CONFLICT'
                    );
                ELSE
                    SELECT MAX(reservation_expires_at) INTO v_existing_expires_at
                    FROM public.tickets
                    WHERE order_id = v_existing_order.id;

                    RETURN jsonb_build_object(
                        'success', true,
                        'order_id', v_existing_order.id,
                        'reference', v_existing_order.reference,
                        'buyer_id', v_existing_order.buyer_id,
                        'total_amount', v_existing_order.total_amount,
                        'ticket_count', v_existing_order.ticket_count,
                        'reservation_expires_at', COALESCE(v_existing_expires_at, v_existing_order.created_at + INTERVAL '15 minutes'),
                        'idempotency_replayed', true
                    );
                END IF;
            ELSE
                RAISE;
            END IF;
    END;

    -- 8. Asignar boletos a la orden creada
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(v_sorted_tickets);

    -- 9. Registrar auditoría inmutable
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
            'reservation_duration_minutes', v_sys_duration,
            'client_idempotency_key', v_idempotency_key,
            'idempotency_fingerprint', v_calculated_fingerprint
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at,
        'idempotency_replayed', false
    );
END;
$$;

-- 2.3 Permisos de ejecución de la RPC para creación de órdenes públicas y autenticadas
GRANT EXECUTE ON FUNCTION public.create_order_secure(
    uuid, text[], jsonb, character varying, character varying, uuid
) TO anon, authenticated, service_role;
