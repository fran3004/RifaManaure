-- ============================================================================
-- Migración 052: Blindaje de Concurrencia, Linearización y Orden de Bloqueos
-- (Auditoría 03 — Remediación 4)
-- ============================================================================
-- 1. Serialización estricta entre create_order_secure y admin_update_raffle:
--    - Adquisición de SELECT ... FOR SHARE sobre public.raffles antes de validar
--      status, ticket_price y max_tickets_per_buyer.
--    - Garantiza linearización determinista frente a pausas (active -> paused)
--      y actualizaciones de precio concurrentes.
-- 2. Consistencia en duración de reserva (10 minutos):
--    - Corrección del fallback residual de 15 minutos en el replay idempotente
--      de create_order_secure a los 10 minutos operativos de system_settings.
-- 3. Jerarquía y orden de locks consistente en todo el sistema:
--    Nivel 1: raffles (FOR SHARE en compras / FOR UPDATE en administración)
--    Nivel 2: orders (FOR UPDATE en gestión / FOR UPDATE OF o SKIP LOCKED en cron)
--    Nivel 3: payment_proofs (FOR UPDATE)
--    Nivel 4: tickets (FOR UPDATE)
-- ============================================================================

-- 1. Eliminar versiones previas de create_order_secure para evitar ambigüedad de firma (42725)
DROP FUNCTION IF EXISTS public.create_order_secure(uuid, text[], jsonb, character varying, character varying);
DROP FUNCTION IF EXISTS public.create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid);

-- 2. Recrear create_order_secure con bloqueo pesimista/compartido sobre raffles y sincronización de 10 min
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id uuid,
    p_ticket_numbers text[],
    p_buyer_data jsonb,
    p_payment_method character varying DEFAULT 'transfer_manual'::character varying,
    p_contact_preference character varying DEFAULT 'both'::character varying,
    p_client_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    v_ticket_ids UUID[];
    v_locked_count INTEGER;
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

    -- Obtener duración del sistema (10 minutos por defecto)
    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);

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
            'reservation_expires_at', COALESCE(v_existing_expires_at, v_existing_order.created_at + (v_sys_duration || ' minutes')::INTERVAL),
            'idempotency_replayed', true
        );
    END IF;

    -- 5. Creación de nueva orden:
    -- LINEARIZACIÓN ESTRICTA Y ORDEN DE LOCKS (NIVEL 1: RAFFLE):
    -- Se adquiere SELECT ... FOR SHARE sobre public.raffles.
    -- Esto garantiza que admin_update_raffle (que adquiere FOR UPDATE) deba esperar si
    -- create_order_secure está corriendo, o viceversa, asegurando que status, ticket_price
    -- y max_tickets_per_buyer no muten en medio de la creación de la orden.
    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RAFFLE_NOT_ACTIVE',
            'error', 'La rifa no se encuentra activa para la venta.'
        );
    END IF;

    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 6. Upsert atómico del comprador
    INSERT INTO public.buyers (document_id, full_name, phone, email, city)
    VALUES (v_doc_id, v_full_name, v_phone, v_email, v_city)
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

    -- 7. ORDEN DE LOCKS (NIVEL 4: TICKETS) - AISLAMIENTO ESTRICTO DE BOLETOS:
    -- Solo se bloquean boletos disponibles. Ninguna reserva de otra orden puede ser despojada.
    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(v_sorted_tickets)
          AND status = 'available'
        FOR UPDATE
    )
    SELECT array_agg(id), count(*)
    INTO v_ticket_ids, v_locked_count
    FROM locked_tickets;

    IF v_locked_count <> v_ticket_count THEN
        -- Identificar los boletos no disponibles para retroalimentación
        SELECT array_agg(t) INTO v_failed_numbers
        FROM unnest(v_sorted_tickets) t
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tickets tk
            WHERE tk.raffle_id = p_raffle_id
              AND tk.number = t
              AND tk.status = 'available'
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'unavailable_tickets', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    -- 8. ORDEN DE LOCKS (NIVEL 2: ORDERS) - Generar referencia e insertar orden:
    v_reference := 'MV-' || UPPER(SUBSTRING(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 8));

    BEGIN
        INSERT INTO public.orders (
            raffle_id, buyer_id, reference, total_amount, ticket_count,
            status, payment_method, contact_preference,
            client_idempotency_key, idempotency_fingerprint
        ) VALUES (
            p_raffle_id, v_buyer_id, v_reference, v_total_amount, v_ticket_count,
            'pending', v_payment_method, v_contact_preference,
            v_idempotency_key, v_calculated_fingerprint
        ) RETURNING id INTO v_order_id;
    EXCEPTION
        WHEN unique_violation THEN
            -- Manejo de carrera milimétrica en idempotencia
            SELECT * INTO v_existing_order
            FROM public.orders
            WHERE client_idempotency_key = v_idempotency_key;

            IF v_existing_order.id IS NOT NULL THEN
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
                    'reservation_expires_at', COALESCE(v_existing_expires_at, v_existing_order.created_at + (v_sys_duration || ' minutes')::INTERVAL),
                    'idempotency_replayed', true
                );
            ELSE
                RAISE;
            END IF;
    END;

    -- 9. Actualizar boletos vinculados a la orden
    UPDATE public.tickets
    SET status = 'reserved',
        order_id = v_order_id,
        buyer_id = v_buyer_id,
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = ANY(v_ticket_ids);

    -- 10. Registrar evento en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'order',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'raffle_id', p_raffle_id,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'ticket_price_snapshot', v_raffle.ticket_price,
            'tickets', v_sorted_tickets,
            'expires_at', v_expires_at,
            'duration_minutes', v_sys_duration,
            'client_idempotency_key', v_idempotency_key
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
$function$;

-- 3. Grants para ejecución pública autorizada
REVOKE ALL ON FUNCTION public.create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid) TO anon, authenticated, service_role;

-- 4. Recrear release_expired_reservations sin cláusula GROUP BY incompatible con FOR UPDATE
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expired_order_ids UUID[];
    v_released_orders_count INTEGER := 0;
    v_released_tickets_count INTEGER := 0;
BEGIN
    -- 1. Identificar y bloquear pesimistamente las órdenes pendientes cuyas reservas ya expiraron
    -- FOR UPDATE SKIP LOCKED sobre órdenes identificadas vía EXISTS (sin GROUP BY incompatible)
    SELECT array_agg(id)
    INTO v_expired_order_ids
    FROM (
        SELECT o.id
        FROM public.orders o
        WHERE o.status = 'pending'
          AND EXISTS (
              SELECT 1
              FROM public.tickets t
              WHERE t.order_id = o.id
                AND t.status = 'reserved'
                AND t.reservation_expires_at < NOW()
          )
        FOR UPDATE SKIP LOCKED
    ) sub;

    IF v_expired_order_ids IS NULL OR array_length(v_expired_order_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    -- 2. Bloquear pesimistamente los boletos asociados
    PERFORM 1
    FROM public.tickets
    WHERE order_id = ANY(v_expired_order_ids)
    FOR UPDATE;

    -- 3. Transicionar órdenes a 'expired'
    UPDATE public.orders
    SET status = 'expired',
        updated_at = NOW()
    WHERE id = ANY(v_expired_order_ids)
      AND status = 'pending';

    GET DIAGNOSTICS v_released_orders_count = ROW_COUNT;

    -- 4. Liberar boletos a 'available' en la misma transacción atómica
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = ANY(v_expired_order_ids)
      AND status = 'reserved';

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    -- 5. Limpieza de contingencia para reservas huérfanas expiradas si existieran
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE status = 'reserved'
      AND reservation_expires_at < NOW()
      AND (order_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.orders o 
          WHERE o.id = tickets.order_id 
            AND o.status IN ('pending', 'pending_verification')
      ));

    RETURN v_released_orders_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO anon, authenticated, service_role;

