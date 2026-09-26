-- ==============================================================================
-- MIGRACIÓN 069: Eliminación Controlada de Ganadores y Rifas por el Administrador
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVOS:
-- 1. Crear función RPC public.admin_delete_winner(p_winner_id UUID):
--    Permite a los administradores autorizados revocar y eliminar registros
--    oficiales de ganadores para viabilizar la reutilización o reanudación
--    de la rifa correspondiente, con trazabilidad completa en audit_logs.
-- 2. Crear función RPC public.admin_delete_raffle(p_raffle_id UUID):
--    Permite a los administradores autorizados eliminar una edición de rifa
--    creada, limpiando en cascada boletos, estado público de tickets,
--    órdenes asociadas, comprobantes y registros vinculados, con registro en audit_logs.
-- ==============================================================================

-- 1. RPC para eliminar ganador (admin_delete_winner)
CREATE OR REPLACE FUNCTION public.admin_delete_winner(p_winner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_winner public.winners%ROWTYPE;
BEGIN
    -- 1. Verificación de autorización de administrador
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE (user_id = v_admin_id OR id = v_admin_id)
          AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden eliminar ganadores.'
        );
    END IF;

    IF p_winner_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VALIDATION_ERROR',
            'error', 'El ID del ganador es obligatorio.'
        );
    END IF;

    -- 2. Bloqueo pesimista e inspección del registro de ganador
    SELECT * INTO v_winner
    FROM public.winners
    WHERE id = p_winner_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'El registro de ganador no existe o ya fue eliminado.'
        );
    END IF;

    -- 3. Eliminar el registro del ganador
    DELETE FROM public.winners
    WHERE id = p_winner_id;

    -- 4. Si la rifa estaba en estado 'finished', cambiarla a 'closed' para permitir reutilización y reactivación
    UPDATE public.raffles
    SET status = 'closed',
        updated_at = NOW()
    WHERE id = v_winner.raffle_id AND status = 'finished';

    -- 5. Registrar en audit_logs
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'WINNER_DELETED_BY_ADMIN',
        'winner',
        p_winner_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', v_winner.raffle_id,
            'ticket_number', v_winner.ticket_number,
            'buyer_id', v_winner.buyer_id,
            'order_id', v_winner.order_id,
            'lottery_draw_number', v_winner.lottery_draw_number,
            'official_act_url', v_winner.official_act_url
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_winner_id,
        'raffle_id', v_winner.raffle_id,
        'ticket_number', v_winner.ticket_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_winner(UUID) TO authenticated, service_role;

-- 2. RPC para eliminar rifa (admin_delete_raffle)
CREATE OR REPLACE FUNCTION public.admin_delete_raffle(p_raffle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_raffle public.raffles%ROWTYPE;
BEGIN
    -- 1. Verificación de autorización de administrador
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE (user_id = v_admin_id OR id = v_admin_id)
          AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FORBIDDEN',
            'error', 'Acceso denegado: solo administradores autorizados pueden eliminar rifas.'
        );
    END IF;

    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VALIDATION_ERROR',
            'error', 'El ID de la rifa es obligatorio.'
        );
    END IF;

    -- 2. Bloqueo pesimista e inspección de la rifa
    SELECT * INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'NOT_FOUND',
            'error', 'La rifa especificada no existe o ya fue eliminada.'
        );
    END IF;

    -- 3. Limpieza transaccional ordenada de entidades dependientes
    -- A. Desvincular ítems de galería fotográfica
    UPDATE public.gallery_items
    SET raffle_id = NULL
    WHERE raffle_id = p_raffle_id;

    -- B. Eliminar ganadores asociados
    DELETE FROM public.winners
    WHERE raffle_id = p_raffle_id;

    -- C. Eliminar comprobantes de pago asociados directamente o por orden
    DELETE FROM public.payment_proofs
    WHERE raffle_id = p_raffle_id;

    -- D. Eliminar estado público de boletos
    DELETE FROM public.ticket_public_state
    WHERE raffle_id = p_raffle_id;

    -- E. Eliminar boletos emitidos
    DELETE FROM public.tickets
    WHERE raffle_id = p_raffle_id;

    -- F. Eliminar órdenes de compra vinculadas a la rifa
    DELETE FROM public.orders
    WHERE raffle_id = p_raffle_id;

    -- G. Eliminar la rifa
    DELETE FROM public.raffles
    WHERE id = p_raffle_id;

    -- 4. Registrar en audit_logs
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_DELETED_BY_ADMIN',
        'raffle',
        p_raffle_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'title', v_raffle.title,
            'ticket_price', v_raffle.ticket_price,
            'total_tickets', v_raffle.total_tickets,
            'status', v_raffle.status,
            'lottery_reference', v_raffle.lottery_reference,
            'draw_date', v_raffle.draw_date
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_raffle_id,
        'title', v_raffle.title
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_raffle(UUID) TO authenticated, service_role;
