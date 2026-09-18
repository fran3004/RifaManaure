-- ============================================================================
-- MIGRACIÓN 012: CREACIÓN SEGURA DE ÓRDENES Y CÁLCULO DE TOTAL EN SERVIDOR
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- Esta migración implementa la función RPC create_order_secure que:
-- 1. Recalcula total_amount directamente desde raffles.ticket_price en PostgreSQL.
-- 2. Bloquea atómicamente los boletos con FOR UPDATE (anti condiciones de carrera).
-- 3. Registra/actualiza el comprador, crea la orden y asigna los boletos en 1 sola transacción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raffle RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '10 minutes';
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

    -- 2. Consultar la rifa oficial y obtener ticket_price directamente de la base de datos
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

    IF v_ticket_count > v_raffle.max_tickets_per_buyer THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_raffle.max_tickets_per_buyer || ' boletos por compra.');
    END IF;

    -- 3. Calcular total_amount exclusivamente en PostgreSQL (NUNCA desde el cliente)
    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    -- 4. Extraer y validar datos del comprador
    v_doc_id := trim(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := trim(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := trim(COALESCE(p_buyer_data->>'phone', ''));
    v_email := lower(trim(COALESCE(p_buyer_data->>'email', '')));
    v_city := trim(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    -- Inserción segura con preservación de datos existentes (DO NOTHING en conflicto)
    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    -- Si ya existía el comprador, recuperar su id sin modificar sus datos originales
    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    -- 5. Liberar reservas expiradas antes de verificar
    PERFORM public.release_expired_reservations();

    -- 6. Bloqueo atómico FOR UPDATE de boletos disponibles
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

    -- 7. Generar referencia única de orden
    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    -- 8. Insertar orden con total calculado en backend
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

    -- 9. Asignar boletos a la orden y establecer expiración de 10 min
    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    -- 10. Registrar auditoría inmutable
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
            'ticket_price', v_raffle.ticket_price,
            'total_amount', v_total_amount,
            'contact_preference', p_contact_preference,
            'ticket_numbers', p_ticket_numbers
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

-- Permisos de ejecución para clientes y backend
GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

