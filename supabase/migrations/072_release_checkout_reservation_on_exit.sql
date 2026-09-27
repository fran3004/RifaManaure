-- ====================================================================
-- MIGRACIÓN 072: Liberación Inmediata de Reservas al Salir del Checkout
-- y Sincronización Dinámica de Expiración
-- ====================================================================
-- 1. release_checkout_reservation:
--    Permite al comprador liberar inmediatamente sus boletos reservados
--    cuando decide cancelar o salir de cualquier fase del modal de compra.
--    Blindado contra ataques IDOR exigiendo coincidencia exacta con
--    p_client_idempotency_key (UUID) o p_order_reference (código comercial).
--    Solo opera sobre órdenes en estado 'pending'.
--
-- 2. release_expired_reservations:
--    Sincroniza el motivo de rechazo ('rejection_reason') para que refleje
--    dinámicamente el valor en minutos configurado en public.system_settings,
--    eliminando textos rígidos o desfasados.
-- ====================================================================

-- 1. Función RPC para liberación voluntaria en checkout
CREATE OR REPLACE FUNCTION public.release_checkout_reservation(
    p_order_id UUID,
    p_client_idempotency_key UUID DEFAULT NULL,
    p_order_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER := 0;
    v_norm_ref TEXT;
BEGIN
    -- 1. Validación de parámetros obligatorios
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PARAMETERS',
            'error', 'El identificador de la orden es obligatorio.'
        );
    END IF;

    IF p_client_idempotency_key IS NULL AND (p_order_reference IS NULL OR TRIM(p_order_reference) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'UNAUTHORIZED',
            'error', 'Se requiere la clave de idempotencia o la referencia de la orden para autorizar la liberación.'
        );
    END IF;

    v_norm_ref := UPPER(TRIM(COALESCE(p_order_reference, '')));

    -- 2. Bloqueo pesimista de la orden (FOR UPDATE) para serializar operaciones concurrentes
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_FOUND',
            'error', 'La orden de compra no existe.'
        );
    END IF;

    -- 3. Verificación de titularidad / sesión (Anti-IDOR)
    -- Se exige coincidencia exacta de la clave de idempotencia del cliente O de la referencia oficial de la orden
    IF (p_client_idempotency_key IS NOT NULL AND v_order.client_idempotency_key = p_client_idempotency_key)
       OR (v_norm_ref <> '' AND UPPER(TRIM(v_order.reference)) = v_norm_ref) THEN
        -- Autorizado
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'No está autorizado para liberar los boletos de esta orden.'
        );
    END IF;

    -- 4. Idempotencia: si la orden ya fue cancelada o expiró, retornar éxito sin error
    IF v_order.status IN ('cancelled', 'expired') THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'reference', v_order.reference,
            'status', v_order.status,
            'already_released', true,
            'tickets_released', 0,
            'message', 'Los boletos de esta orden ya habían sido liberados previamente.'
        );
    END IF;

    -- 5. Salvaguarda de estados terminales o con comprobante
    -- Prohíbe cancelar órdenes pagadas o que ya tengan comprobante en proceso de verificación
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_ALREADY_PAID',
            'error', 'No se pueden liberar boletos de una orden que ya fue pagada y confirmada.'
        );
    END IF;

    IF v_order.status = 'pending_verification' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PAYMENT_PROOF_ATTACHED',
            'error', 'La orden ya cuenta con comprobante de pago en revisión. Comuníquese con soporte si desea cancelarla.'
        );
    END IF;

    IF v_order.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_ORDER_STATUS',
            'error', 'Solo es posible liberar órdenes en estado pendiente de pago (actual: "' || v_order.status || '").'
        );
    END IF;

    -- 6. Bloqueo pesimista de boletos vinculados a esta orden exclusivamente
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 7. Transición de la orden a 'cancelled' (dispara validación de estado y auditoría)
    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = 'Liberación voluntaria de reserva por el usuario al salir del proceso de compra.',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 8. Liberar boletos asociados inmediatamente
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id
      AND status = 'reserved';

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    -- 9. Registrar auditoría transaccional
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'CHECKOUT_RESERVATION_RELEASED',
        'orders',
        p_order_id::TEXT,
        NULL,
        jsonb_build_object(
            'order_id', p_order_id,
            'reference', v_order.reference,
            'tickets_released', v_tickets_released,
            'buyer_id', v_order.buyer_id,
            'raffle_id', v_order.raffle_id,
            'reason', 'Salida voluntaria del modal de compra'
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'reference', v_order.reference,
        'status', 'cancelled',
        'tickets_released', v_tickets_released,
        'message', 'Reserva liberada exitosamente.'
    );
END;
$$;

-- Permisos RPC: disponible para compradores anónimos (anon) y autenticados (authenticated)
REVOKE ALL ON FUNCTION public.release_checkout_reservation(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_checkout_reservation(UUID, UUID, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.release_checkout_reservation(UUID, UUID, TEXT) IS
'Permite al comprador liberar inmediatamente sus boletos reservados al salir del modal de compra en cualquier fase previa al comprobante. Valida titularidad mediante clave de idempotencia o referencia oficial.';


-- 2. Sincronizar release_expired_reservations con la duración dinámica de system_settings
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
    v_sys_duration INTEGER := 10;
BEGIN
    -- 1. Control de Concurrencia y Prevención de Solapamiento
    v_acquired_lock := pg_try_advisory_xact_lock(hashtext('release_expired_reservations'));
    IF NOT v_acquired_lock THEN
        RETURN 0;
    END IF;

    -- 1.1 Auto-cerrar rifas activas cuya fecha límite ya venció
    PERFORM public.check_and_auto_close_expired_raffles();

    -- 1.2 Obtener la duración oficial de reserva configurada en system_settings
    SELECT reservation_duration_minutes
    INTO v_sys_duration
    FROM public.system_settings
    WHERE id = 1;
    v_sys_duration := COALESCE(v_sys_duration, 10);

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
            rejection_reason = COALESCE(rejection_reason, 'Tiempo límite de reserva (' || v_sys_duration || ' min) agotado sin confirmación de pago.'),
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
                'system',
                'pg_cron',
                NULL,
                jsonb_build_object(
                    'orders_expired', v_released_orders_count,
                    'tickets_released', v_released_tickets_count,
                    'duration_minutes', v_sys_duration,
                    'order_ids', v_expired_order_ids,
                    'executed_at', NOW()
                )
            );
        END IF;
    END IF;

    RETURN v_released_tickets_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

COMMENT ON FUNCTION public.release_expired_reservations() IS
'Liberación concurrente periódica de reservas expiradas vía pg_cron. Dinamiza el motivo de rechazo según reservation_duration_minutes de system_settings.';
