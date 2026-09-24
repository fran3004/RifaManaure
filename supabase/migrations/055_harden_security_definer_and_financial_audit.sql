-- ==============================================================================
-- MIGRACIÓN 055: HARDENING DE SECURITY DEFINER, CONTRATO DE ERRORES Y AUDITORÍA FINANCIERA
-- ==============================================================================
-- AUDITORÍA 05 — REMEDIACIÓN 4
-- Hallazgos Abordados: CRIT-03, CRIT-05, EVENT-05, EVENT-06, EVENT-07
--
-- OBJETIVOS:
-- 1. [CRIT-05 / EVENT-07] Eliminación de vulnerabilidad de Search Path Hijacking:
--    Fijar explícitamente `SET search_path = pg_catalog, public, auth, pg_temp` (o `extensions`)
--    en la totalidad de funciones SECURITY DEFINER del catálogo. Al anteponer `pg_catalog`,
--    las funciones nativas del sistema nunca podrán ser suplantadas por objetos temporales o locales.
-- 2. [CRIT-03 / EVENT-06] Estandarización del protocolo de errores en RPCs críticas:
--    - Errores de validación/negocio: Retorno JSON estructurado con código canónico:
--      'FORBIDDEN', 'NOT_FOUND', 'INVALID_STATE', 'CONFLICT', 'VALIDATION_ERROR', 'INTEGRITY_ERROR'.
--    - Violaciones de integridad/invariantes de motor: RAISE EXCEPTION para forzar rollback transaccional.
--    - Autorización denegada: RAISE EXCEPTION USING ERRCODE = '42501' (HTTP 403 Forbidden).
-- 3. [EVENT-05] Auditoría Financiera Explícita y Trazable (Exactamente un evento por acción):
--    - En `fn_validate_order_status_transition`, mapear:
--      'paid'      -> 'ORDER_PAYMENT_APPROVED'
--      'rejected'  -> 'ORDER_PAYMENT_REJECTED'
--      'cancelled' -> 'ORDER_CANCELLED'
--    - Capturar en `details`: order_id, actor, timestamp, ticket_count, rejection_reason, reference, total_amount.
--    - CERO duplicados y CERO exposición de PII del comprador.
-- 4. Purga formal de funciones obsoletas y deprecadas:
--    - confirm_order_payment (001)
--    - submit_order_receipt (004)
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: PURGA DE FUNCIONES OBSOLETAS Y DEPRECADAS
-- ==============================================================================

DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT);


-- ==============================================================================
-- SECCIÓN 2: TRIGGER DE ESTADOS Y AUDITORÍA FINANCIERA (fn_validate_order_status_transition)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_audit_action TEXT;
BEGIN
    -- Inmutabilidad de raffle_id y reference en cualquier orden existente
    IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
        RAISE EXCEPTION 'Violación de Integridad: Prohibido reasignar la rifa de una orden existente (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    IF NEW.reference IS DISTINCT FROM OLD.reference THEN
        RAISE EXCEPTION 'Violación de Integridad: La referencia comercial de una orden es inmutable (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    -- Inmutabilidad de la clave de idempotencia asignada
    IF NEW.client_idempotency_key IS DISTINCT FROM OLD.client_idempotency_key THEN
        RAISE EXCEPTION 'Violación de Integridad: La clave de idempotencia de una orden es inmutable (id: %, ref: %).', OLD.id, OLD.reference;
    END IF;

    -- Blindaje de orden pagada: proteger términos comerciales inmutables
    IF OLD.status = 'paid' THEN
        IF NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
        END IF;

        IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar el comprador de una orden pagada (ref: %).', OLD.reference;
        END IF;

        IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar el monto total de una orden pagada (ref: %).', OLD.reference;
        END IF;

        IF NEW.ticket_count IS DISTINCT FROM OLD.ticket_count THEN
            RAISE EXCEPTION 'Violación de Integridad: Prohibido modificar la cantidad de boletos de una orden pagada (ref: %).', OLD.reference;
        END IF;
    END IF;

    -- Si el estado no cambió en órdenes no pagadas, permitir actualizaciones
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid' sin comprobante o referencia de pago
    IF OLD.status = 'pending' AND NEW.status = 'paid' THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir que órdenes en estados terminales ('expired', 'rejected', 'cancelled') pasen a 'paid'
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status = 'paid' THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- Determinar el nombre canónico de la acción para trazabilidad financiera y operativa
    v_audit_action := CASE NEW.status
        WHEN 'paid' THEN 'ORDER_PAYMENT_APPROVED'
        WHEN 'rejected' THEN 'ORDER_PAYMENT_REJECTED'
        WHEN 'cancelled' THEN 'ORDER_CANCELLED'
        ELSE 'ORDER_STATUS_' || UPPER(NEW.status)
    END;

    -- Registro de auditoría financiera estructurada (sin PII del comprador)
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        v_audit_action,
        'order',
        NEW.id::TEXT,
        NEW.verified_by,
        jsonb_build_object(
            'order_id', NEW.id,
            'actor', NEW.verified_by,
            'timestamp', NOW(),
            'reference', NEW.reference,
            'previous_status', OLD.status,
            'new_status', NEW.status,
            'total_amount', NEW.total_amount,
            'ticket_count', NEW.ticket_count,
            'rejection_reason', NEW.rejection_reason
        )
    );

    RETURN NEW;
END;
$$;


-- ==============================================================================
-- SECCIÓN 3: HARDENING Y ESTANDARIZACIÓN DE ERRORES EN RPCS CRÍTICAS
-- ==============================================================================

-- 3.1 approve_order_payment
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_total_tickets INTEGER;
    v_invalid_tickets INTEGER;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Bloqueo pesimista de la fila de la orden para serializar aprobaciones concurrentes
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'La orden de compra no existe.'
        );
    END IF;

    -- 3. Idempotencia y validación del estado previo de la orden
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    IF v_order.status NOT IN ('pending_verification', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'No se puede aprobar la orden en su estado actual ("' || v_order.status || '"). Solo se admiten órdenes en verificación o pendientes.'
        );
    END IF;

    -- 4. INVARIANTE DB-10: Bloqueo e inspección de boletos pertenecientes a la orden
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status NOT IN ('reserved', 'sold'))
    INTO 
        v_total_tickets,
        v_invalid_tickets
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- DB-10: Una orden sin boletos NO puede pasar a paid bajo ninguna circunstancia
    IF v_total_tickets IS NULL OR v_total_tickets = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INTEGRITY_ERROR',
            'error', 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.'
        );
    END IF;

    -- Verificación de coherencia con el recuento nominal de boletos
    IF v_order.ticket_count IS NOT NULL AND v_order.ticket_count > 0 AND v_total_tickets <> v_order.ticket_count THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INTEGRITY_ERROR',
            'error', 'Discrepancia en cantidad de boletos: la orden registra ' || v_order.ticket_count || ' boletos pero se encontraron ' || v_total_tickets || ' boletos asociados.'
        );
    END IF;

    -- Verificación de estado de los boletos asociados
    IF v_invalid_tickets > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Uno o más boletos asociados a la orden se encuentran en un estado incompatible con la venta.'
        );
    END IF;

    -- 5. Transición de estados de la orden y comprobante
    -- Se actualiza primero la orden a 'paid' para cumplir con el trigger trg_validate_ticket_status
    -- y disparar trg_validate_order_status (auditoría ORDER_PAYMENT_APPROVED)
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. INVARIANTE DB-01: Actualizar EXCLUSIVAMENTE los boletos de p_order_id
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    -- Garantía de consistencia atómica: si por carrera concurrente no se actualizaron todos, abortar
    IF v_updated_tickets_count <> v_total_tickets THEN
        RAISE EXCEPTION 'Fallo de consistencia atómica: se esperaba actualizar % boletos pero se afectaron %.',
            v_total_tickets, v_updated_tickets_count;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;


-- 3.2 reject_order_payment
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_reason TEXT;
    v_released_tickets_count INTEGER;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador'
            USING ERRCODE = '42501';
    END IF;

    v_clean_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Comprobante no válido o transferencia no confirmada');

    -- 2. Bloqueo pesimista de la fila de la orden para serializar rechazos concurrentes
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'La orden de compra no existe.'
        );
    END IF;

    -- 3. Idempotencia y validación del estado previo de la orden
    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    IF v_order.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'La orden ya se encuentra rechazada anteriormente.'
        );
    END IF;

    IF v_order.status IN ('expired', 'cancelled', 'refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Una orden en estado finalizado ("' || v_order.status || '") no puede ser rechazada.'
        );
    END IF;

    -- 4. Bloquear los boletos de esta orden exclusivamente
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 5. Transición de estados de la orden y comprobante
    -- Dispara el trigger trg_validate_order_status que registra ORDER_PAYMENT_REJECTED
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. INVARIANTE DB-01: Liberar EXCLUSIVAMENTE los boletos pertenecientes a p_order_id
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;


-- 3.3 cancel_order
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación administrativa de orden'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_clean_reason TEXT;
    v_tickets_released INTEGER := 0;
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Verificación estricta de autorización administrativa (SEC-03)
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador para cancelar órdenes'
            USING ERRCODE = '42501';
    END IF;

    v_clean_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelación administrativa de orden');

    -- 2. Bloqueo pesimista de la fila de la orden para serializar operaciones concurrentes
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'La orden de compra no existe.'
        );
    END IF;

    -- 3. Idempotencia y validación de la máquina de estados
    IF v_order.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'status', 'cancelled',
            'already_cancelled', true,
            'tickets_released', 0,
            'message', 'La orden ya se encontraba cancelada anteriormente.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'No se puede cancelar una orden que ya fue pagada y confirmada.'
        );
    END IF;

    IF v_order.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'No se puede cancelar una orden que ya fue rechazada.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Estado de orden no cancelable: "' || v_order.status || '". Solo se pueden cancelar órdenes en estado pending o pending_verification.'
        );
    END IF;

    -- 4. Bloqueo pesimista de boletos pertenecientes a esta orden exclusivamente
    PERFORM 1
    FROM public.tickets
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 5. Transición de la orden a 'cancelled' (dispara trg_validate_order_status -> ORDER_CANCELLED)
    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = v_clean_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Si existe comprobante asociado, actualizar su estado para coherencia operativa
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = v_clean_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- 6. Liberar EXCLUSIVAMENTE los boletos asociados a esta orden
    UPDATE public.tickets
    SET status = 'available',
        order_id = NULL,
        buyer_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled',
        'tickets_released', v_tickets_released,
        'message', 'Orden cancelada exitosamente y boletos liberados para la venta.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO authenticated, service_role;


-- 3.4 register_winner
CREATE OR REPLACE FUNCTION public.register_winner(
    p_raffle_id UUID,
    p_ticket_number TEXT,
    p_lottery_draw_number TEXT,
    p_draw_date TIMESTAMPTZ DEFAULT NOW(),
    p_official_act_url TEXT DEFAULT NULL,
    p_delivery_photos TEXT[] DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_ticket RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_winner public.winners%ROWTYPE;
    v_raffle_title TEXT;
    v_clean_ticket_number TEXT;
    v_clean_lottery_number TEXT;
BEGIN
    -- 1. Autorización: Exclusivo para administradores activos
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    -- 2. Validaciones de Parámetros Obligatorios
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_clean_ticket_number := TRIM(COALESCE(p_ticket_number, ''));
    IF v_clean_ticket_number = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El número del boleto ganador es obligatorio.');
    END IF;

    v_clean_lottery_number := TRIM(COALESCE(p_lottery_draw_number, ''));
    IF v_clean_lottery_number = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El número de sorteo de la lotería oficial es obligatorio.');
    END IF;

    -- 3. Verificar Existencia de la Rifa
    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'La rifa especificada no existe.');
    END IF;

    -- 4. Idempotencia Temprana (DB-15): Verificar si ya existe ganador registrado para este boleto
    IF EXISTS (
        SELECT 1 FROM public.winners 
        WHERE raffle_id = p_raffle_id 
          AND (ticket_number = v_clean_ticket_number OR ticket_number = LPAD(v_clean_ticket_number, 3, '0'))
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONFLICT',
            'error', 'El boleto "' || v_clean_ticket_number || '" ya ha sido registrado como ganador para esta rifa.'
        );
    END IF;

    -- 5. Bloqueo Pesimista del Boleto y Recuperación de Comprador y Orden
    SELECT 
        t.id AS ticket_id,
        t.number AS ticket_number,
        t.status AS ticket_status,
        t.order_id AS ticket_order_id,
        t.buyer_id AS ticket_buyer_id,
        o.id AS order_id,
        o.buyer_id AS order_buyer_id,
        o.reference AS order_reference,
        o.status AS order_status,
        b.id AS buyer_id,
        b.full_name AS buyer_name,
        b.document_id AS buyer_document,
        b.phone AS buyer_phone,
        b.email AS buyer_email,
        b.city AS buyer_city
    INTO v_ticket
    FROM public.tickets t
    LEFT JOIN public.orders o ON o.id = t.order_id
    LEFT JOIN public.buyers b ON b.id = COALESCE(t.buyer_id, o.buyer_id)
    WHERE t.raffle_id = p_raffle_id 
      AND (t.number = v_clean_ticket_number OR t.number = LPAD(v_clean_ticket_number, 3, '0'))
    FOR UPDATE OF t;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'El número de boleto "' || v_clean_ticket_number || '" no existe en la emisión de esta rifa.'
        );
    END IF;

    -- 6. Validación de Estado Comercial: Solo boletos 'sold' pueden premiarse
    IF v_ticket.ticket_status <> 'sold' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'El boleto "' || v_ticket.ticket_number || '" no puede registrarse como ganador porque no está vendido (Estado actual: ' || v_ticket.ticket_status || '). Solo boletos con pago confirmado pueden ser ganadores.'
        );
    END IF;

    v_order_id := COALESCE(v_ticket.ticket_order_id, v_ticket.order_id);
    v_buyer_id := COALESCE(v_ticket.ticket_buyer_id, v_ticket.order_buyer_id, v_ticket.buyer_id);

    IF v_order_id IS NULL OR v_buyer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'No se encontró la orden de compra o los datos del comprador vinculados a este boleto.'
        );
    END IF;

    -- 7. Inserción Transaccional con Captura de Conflicto Concurrente (DB-15)
    BEGIN
        INSERT INTO public.winners (
            raffle_id,
            order_id,
            buyer_id,
            ticket_id,
            ticket_number,
            lottery_draw_number,
            draw_date,
            official_act_url,
            delivery_photos,
            notes,
            registered_by,
            created_at,
            updated_at
        ) VALUES (
            p_raffle_id,
            v_order_id,
            v_buyer_id,
            v_ticket.ticket_id,
            v_ticket.ticket_number,
            v_clean_lottery_number,
            COALESCE(p_draw_date, NOW()),
            NULLIF(TRIM(p_official_act_url), ''),
            COALESCE(p_delivery_photos, '{}'),
            NULLIF(TRIM(p_notes), ''),
            v_admin_id,
            NOW(),
            NOW()
        )
        RETURNING * INTO v_winner;
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'CONFLICT',
                'error', 'Conflicto de concurrencia: el boleto "' || v_clean_ticket_number || '" ya fue registrado como ganador por otro proceso concurrente.'
            );
    END;

    -- 8. Finalización de la Rifa
    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    -- 9. Auditoría Única de Registro de Ganador
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'WINNER_REGISTERED',
        'winner',
        v_winner.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'raffle_title', v_raffle_title,
            'ticket_number', v_winner.ticket_number,
            'lottery_draw_number', v_winner.lottery_draw_number,
            'buyer_id', v_buyer_id,
            'buyer_name', v_ticket.buyer_name,
            'order_id', v_order_id,
            'order_reference', v_ticket.order_reference,
            'draw_date', v_winner.draw_date
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Ganador registrado exitosamente. La rifa ha sido finalizada formalmente.',
        'winner_id', v_winner.id,
        'ticket_number', v_winner.ticket_number,
        'buyer_name', v_ticket.buyer_name,
        'raffle_title', v_raffle_title
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;


-- 3.5 admin_block_ticket
CREATE OR REPLACE FUNCTION public.admin_block_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Bloqueado preventivamente por administración'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_order RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VALIDATION_ERROR',
            'error', 'Debe especificar un motivo claro para bloquear el boleto.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status = 'sold' THEN
        IF v_ticket.order_id IS NOT NULL THEN
            SELECT * INTO v_order
            FROM public.orders
            WHERE id = v_ticket.order_id;

            IF v_order.status IN ('paid', 'completed') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'INVALID_STATE',
                    'error', 'Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (' || v_order.reference || ').'
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INVALID_STATE',
                'error', 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.'
            );
        END IF;
    END IF;

    IF v_ticket.status = 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'El boleto número ' || v_ticket.number || ' ya se encuentra bloqueado.'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'blocked',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_BLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', v_ticket.status,
            'new_status', 'blocked',
            'reason', TRIM(p_reason),
            'previous_order_id', v_ticket.order_id,
            'previous_buyer_id', v_ticket.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' bloqueado exitosamente.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_block_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_ticket(UUID, TEXT) TO authenticated, service_role;


-- 3.6 admin_unblock_ticket
CREATE OR REPLACE FUNCTION public.admin_unblock_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Desbloqueado por administración para habilitar venta'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status != 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'El boleto número ' || v_ticket.number || ' no está bloqueado (estado actual: ' || v_ticket.status || ').'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_UNBLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', 'blocked',
            'new_status', 'available',
            'reason', TRIM(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' desbloqueado y disponible para la venta.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) TO authenticated, service_role;


-- 3.7 admin_update_raffle
CREATE OR REPLACE FUNCTION public.admin_update_raffle(
    p_raffle_id uuid, 
    p_title text, 
    p_description text, 
    p_ticket_price numeric, 
    p_draw_date timestamp with time zone, 
    p_lottery_reference text, 
    p_status text, 
    p_max_tickets_per_buyer integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
BEGIN
    -- 1. Autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    -- 2. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    -- 3. Bloqueo pesimista de la rifa e inspección del estado actual
    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'La rifa especificada no existe.');
    END IF;

    -- Blindaje contra reapertura de rifas terminadas
    IF v_old_raffle.status = 'finished' AND p_status <> 'finished' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATE',
            'error', 'Operación rechazada: Una rifa en estado "finished" no puede ser reabierta ni modificada a otro estado.'
        );
    END IF;

    -- 4. Actualización atómica
    UPDATE public.raffles
    SET
        title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    -- 5. Registro estructurado en audit_logs
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED_BY_ADMIN',
        'raffle',
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
            )
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rifa actualizada exitosamente.',
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'status', v_new_raffle.status,
            'ticket_price', v_new_raffle.ticket_price
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_raffle(uuid, text, text, numeric, timestamptz, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_raffle(uuid, text, text, numeric, timestamptz, text, text, integer) TO authenticated, service_role;


-- 3.8 admin_update_system_settings
CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
    p_reservation_duration_minutes INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_support_whatsapp_number TEXT,
    p_support_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_settings public.system_settings%ROWTYPE;
    v_new_settings public.system_settings%ROWTYPE;
    v_whatsapp_clean VARCHAR(30);
    v_email_clean VARCHAR(150);
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar los parámetros del sistema.'
        );
    END IF;

    IF p_reservation_duration_minutes IS NULL OR p_reservation_duration_minutes < 1 OR p_reservation_duration_minutes > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VALIDATION_ERROR',
            'error', 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.'
        );
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer < 1 OR p_max_tickets_per_buyer > 1000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VALIDATION_ERROR',
            'error', 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.'
        );
    END IF;

    v_whatsapp_clean := NULLIF(TRIM(p_support_whatsapp_number), '');
    v_email_clean := NULLIF(LOWER(TRIM(p_support_email)), '');

    SELECT * INTO v_old_settings
    FROM public.system_settings
    WHERE id = 1
    FOR UPDATE;

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
        'message', 'Parámetros del sistema actualizados exitosamente.',
        'settings', jsonb_build_object(
            'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
            'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
            'support_whatsapp_number', v_new_settings.support_whatsapp_number,
            'support_email', v_new_settings.support_email,
            'updated_at', v_new_settings.updated_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;


-- ==============================================================================
-- SECCIÓN 4: BLINDAJE MASIVO DE SEARCH_PATH EN FUNCIONES SECURITY DEFINER RESTANTES
-- ==============================================================================

-- 4.1 RPCs Públicas
ALTER FUNCTION public.create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid) 
    SET search_path = pg_catalog, public, extensions, pg_temp;

ALTER FUNCTION public.submit_payment_proof(uuid, text, text, integer, character varying, text, uuid) 
    SET search_path = pg_catalog, public, extensions, pg_temp;

ALTER FUNCTION public.verify_public_order_or_tickets(text, text) 
    SET search_path = pg_catalog, public, pg_temp;

-- 4.2 RPCs y Helpers de Autenticación
ALTER FUNCTION public.is_admin(uuid) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.is_superadmin(uuid) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.admin_invite_user(text, text, text) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.admin_list_users() 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.admin_toggle_user_status(uuid, boolean) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.admin_update_buyer(uuid, text, text, text, text, text) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.admin_create_raffle(text, text, text, numeric, integer, integer, timestamptz, text, text) 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.get_dashboard_kpis(uuid) 
    SET search_path = pg_catalog, public, auth, pg_temp;

-- 4.3 Sistema y Cron
ALTER FUNCTION public.release_expired_reservations() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.reserve_tickets(uuid, text[], uuid) 
    SET search_path = pg_catalog, public, pg_temp;

-- 4.4 Funciones Trigger y Storage Helpers (SECURITY DEFINER)
ALTER FUNCTION public.fn_is_order_pending_proof(text) 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.fn_protect_admin_users() 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.fn_audit_payment_accounts() 
    SET search_path = pg_catalog, public, auth, pg_temp;

ALTER FUNCTION public.fn_check_order_ticket_matrix() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.fn_check_ticket_order_matrix() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.fn_validate_raffle_status_transition() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.fn_validate_ticket_status_transition() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.fn_sync_ticket_public_state() 
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.sync_admin_user_id() 
    SET search_path = pg_catalog, public, auth, pg_temp;


-- ==============================================================================
-- SECCIÓN 5: REAFIRMACIÓN DE PRIVILEGIOS Y POLÍTICA DE MÍNIMO PRIVILEGIO (LEAST PRIVILEGE)
-- ==============================================================================

-- Preservar acceso anónimo y autenticado solo para las 3 RPCs públicas y los helpers de verificación
GRANT EXECUTE ON FUNCTION public.create_order_secure(uuid, text[], jsonb, character varying, character varying, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(uuid, text, text, integer, character varying, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO anon, authenticated, service_role;

-- Revocación defensiva contra acceso público en RPCs administrativas y de sistema
REVOKE ALL ON FUNCTION public.admin_block_ticket(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unblock_ticket(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_raffle(uuid, text, text, numeric, timestamptz, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_system_settings(integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_order_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_order_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_winner(uuid, text, text, timestamptz, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_raffle(text, text, text, numeric, integer, integer, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_invite_user(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_toggle_user_status(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_buyer(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dashboard_kpis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_tickets(uuid, text[], uuid) FROM PUBLIC, anon, authenticated;
