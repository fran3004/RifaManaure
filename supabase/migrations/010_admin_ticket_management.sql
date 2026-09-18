-- ============================================================================
-- MIGRACIÓN 010: GESTIÓN ADMINISTRATIVA SEGURA DE TICKETS Y AUDITORÍA
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Procedimiento transaccional para bloquear un ticket
CREATE OR REPLACE FUNCTION public.admin_block_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Bloqueado preventivamente por administración'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket RECORD;
    v_order RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    -- Validar permisos de administrador
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    -- Validar motivo
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe especificar un motivo claro para bloquear el boleto.'
        );
    END IF;

    -- Consultar y bloquear fila del boleto
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    -- REGLA DE ORO DE SEGURIDAD:
    -- NO permitir bloquear tickets vendidos asociados a órdenes pagadas
    IF v_ticket.status = 'sold' THEN
        IF v_ticket.order_id IS NOT NULL THEN
            SELECT * INTO v_order
            FROM public.orders
            WHERE id = v_ticket.order_id;

            IF v_order.status IN ('paid', 'completed') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (' || v_order.reference || ').'
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.'
            );
        END IF;
    END IF;

    IF v_ticket.status = 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' ya se encuentra bloqueado.'
        );
    END IF;

    -- Actualizar estado del boleto a 'blocked' y liberar posibles reservas temporales
    UPDATE public.tickets
    SET
        status = 'blocked',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Registrar auditoría inmutable
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
            'reason', trim(p_reason),
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

-- 2. Procedimiento transaccional para desbloquear un ticket
CREATE OR REPLACE FUNCTION public.admin_unblock_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Desbloqueado por administración para habilitar venta'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    -- Validar permisos de administrador
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    -- Consultar y bloquear fila del boleto
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status != 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' no está bloqueado (estado actual: ' || v_ticket.status || ').'
        );
    END IF;

    -- Actualizar estado a 'available'
    UPDATE public.tickets
    SET
        status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Registrar auditoría inmutable
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
            'reason', trim(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' desbloqueado y disponible para la venta.',
        'ticket_number', v_ticket.number
    );
END;
$$;

