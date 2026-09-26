-- ==============================================================================
-- MIGRACIÓN 065: Cierre automático de rifas por fecha límite de sorteo
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVO:
-- 1. Cerrar automáticamente la venta de boletos cuando una rifa alcance o supere
--    su fecha y hora límite de sorteo (draw_date <= NOW()).
-- 2. Blindar create_order_secure para impedir estrictamente la creación de órdenes
--    en sorteos expirados por fecha.
-- 3. Integrar la verificación periódica con el programador de tareas y mantenimiento.
-- ==============================================================================

-- 1. Función RPC para verificar y auto-cerrar rifas expiradas
CREATE OR REPLACE FUNCTION public.check_and_auto_close_expired_raffles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
    v_closed_count INTEGER := 0;
    v_closed_ids UUID[];
    v_raffle_record RECORD;
BEGIN
    -- Seleccionar y bloquear pesimistamente las rifas activas cuya fecha de sorteo ya venció
    FOR v_raffle_record IN
        SELECT id, title, draw_date
        FROM public.raffles
        WHERE status = 'active'
          AND draw_date IS NOT NULL
          AND draw_date <= NOW()
        FOR UPDATE
    LOOP
        UPDATE public.raffles
        SET status = 'closed',
            updated_at = NOW()
        WHERE id = v_raffle_record.id;

        v_closed_ids := array_append(v_closed_ids, v_raffle_record.id);
        v_closed_count := v_closed_count + 1;

        -- Registrar en bitácora de auditoría
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details,
            created_at
        ) VALUES (
            'AUTO_CLOSE_RAFFLE_DRAW_DATE',
            'raffles',
            v_raffle_record.id::TEXT,
            NULL,
            jsonb_build_object(
                'title', v_raffle_record.title,
                'draw_date', v_raffle_record.draw_date,
                'closed_at', NOW(),
                'reason', 'Fecha y hora del sorteo alcanzada automáticamente'
            ),
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'closed_count', v_closed_count,
        'closed_ids', COALESCE(v_closed_ids, '{}'::UUID[])
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_auto_close_expired_raffles() TO anon, authenticated, service_role;

-- 2. Hardening en create_order_secure para validar fecha límite de sorteo
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
    -- LINEARIZACIÓN ESTRICTA Y ORDEN DE LOCKS (NIVEL 1: RAFFLE)
    SELECT id, title, ticket_price, max_tickets_per_buyer, status, draw_date
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    -- 5.1 Verificación de estado de la rifa
    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RAFFLE_NOT_ACTIVE',
            'error', 'La rifa no se encuentra activa para la venta.'
        );
    END IF;

    -- 5.2 Verificación estricta de fecha límite de sorteo
    IF v_raffle.draw_date IS NOT NULL AND v_raffle.draw_date <= NOW() THEN
        -- Auto-cerrar la rifa de forma preventiva
        UPDATE public.raffles
        SET status = 'closed', updated_at = NOW()
        WHERE id = p_raffle_id AND status = 'active';

        RETURN jsonb_build_object(
            'success', false,
            'code', 'RAFFLE_CLOSED_EXPIRED',
            'error', 'El plazo oficial de venta para esta edición ha finalizado debido a que se alcanzó la fecha y hora del sorteo.'
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

    -- 7. LINEARIZACIÓN ESTRICTA Y ORDEN DE LOCKS (NIVEL 2: TICKETS)
    SELECT array_agg(t.id ORDER BY t.number ASC)
    INTO v_ticket_ids
    FROM public.tickets t
    WHERE t.raffle_id = p_raffle_id
      AND t.number = ANY(v_sorted_tickets)
      AND t.status = 'available'
    FOR UPDATE;

    v_locked_count := COALESCE(array_length(v_ticket_ids, 1), 0);

    -- Si no se pudieron bloquear todos los boletos solicitados, detectar faltantes
    IF v_locked_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(v_sorted_tickets) AS num
        WHERE num NOT IN (
            SELECT t2.number
            FROM public.tickets t2
            WHERE t2.id = ANY(COALESCE(v_ticket_ids, '{}'::UUID[]))
        );

        RETURN jsonb_build_object(
            'success', false,
            'code', 'TICKETS_UNAVAILABLE',
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'unavailable_numbers', COALESCE(v_failed_numbers, '{}'::TEXT[])
        );
    END IF;

    -- 8. Generar referencia y crear la orden de compra
    v_reference := 'MAN-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        client_idempotency_key,
        idempotency_fingerprint,
        created_at,
        updated_at
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        v_payment_method,
        v_idempotency_key,
        v_calculated_fingerprint,
        NOW(),
        NOW()
    ) RETURNING id INTO v_order_id;

    -- 9. Actualizar boletos a 'reserved' vinculados a la orden
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE id = ANY(v_ticket_ids);

    -- 10. Registrar auditoría transaccional de orden creada
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'orders',
        v_order_id::TEXT,
        NULL,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'buyer_id', v_buyer_id,
            'reference', v_reference,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'payment_method', v_payment_method,
            'contact_preference', v_contact_preference,
            'idempotency_key', v_idempotency_key,
            'fingerprint', v_calculated_fingerprint
        ),
        NOW()
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

-- 3. Extender release_expired_reservations para invocar check_and_auto_close_expired_raffles
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_acquired_lock BOOLEAN;
    v_expired_order_ids UUID[];
    v_released_orders_count INTEGER := 0;
    v_released_tickets_count INTEGER := 0;
    v_orphan_tickets_count INTEGER := 0;
BEGIN
    -- 1. Control de Concurrencia y Prevención de Solapamiento
    v_acquired_lock := pg_try_advisory_xact_lock(hashtext('release_expired_reservations'));
    IF NOT v_acquired_lock THEN
        RETURN 0;
    END IF;

    -- 1.1 Auto-cerrar rifas activas cuya fecha límite ya venció
    PERFORM public.check_and_auto_close_expired_raffles();

    -- 2. Identificar y bloquear pesimistamente las órdenes pendientes cuyas reservas ya expiraron
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

    -- 3. Si existen órdenes expiradas bloqueadas, proceder a transicionar y liberar
    IF v_expired_order_ids IS NOT NULL AND array_length(v_expired_order_ids, 1) > 0 THEN
        PERFORM 1
        FROM public.tickets
        WHERE order_id = ANY(v_expired_order_ids)
        FOR UPDATE;

        UPDATE public.orders
        SET status = 'expired',
            rejection_reason = COALESCE(rejection_reason, 'Tiempo límite de reserva de 10 minutos agotado sin confirmación de pago.'),
            updated_at = NOW()
        WHERE id = ANY(v_expired_order_ids)
          AND status = 'pending';

        GET DIAGNOSTICS v_released_orders_count = ROW_COUNT;

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

        IF v_released_tickets_count > 0 THEN
            INSERT INTO public.audit_logs (
                action,
                entity_type,
                entity_id,
                performed_by,
                details
            ) VALUES (
                'AUTO_EXPIRE_RESERVATIONS_CRON',
                'system_job',
                gen_random_uuid()::TEXT,
                NULL,
                jsonb_build_object(
                    'tickets_released', v_released_tickets_count,
                    'orders_expired', v_released_orders_count,
                    'expired_order_ids', v_expired_order_ids,
                    'execution_timestamp', NOW()
                )
            );
        END IF;
    END IF;

    -- 4. Tratamiento de boletos huérfanos
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
          SELECT 1 FROM public.orders o WHERE o.id = tickets.order_id AND o.status = 'pending'
      ));

    GET DIAGNOSTICS v_orphan_tickets_count = ROW_COUNT;
    v_released_tickets_count := v_released_tickets_count + v_orphan_tickets_count;

    RETURN v_released_tickets_count;
END;
$$;
