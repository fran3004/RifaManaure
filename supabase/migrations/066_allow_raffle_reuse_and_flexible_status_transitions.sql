-- ==============================================================================
-- MIGRACIÓN 066: Flexibilización total de estados y reutilización de rifas
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- OBJETIVO:
-- 1. Permitir al administrador modificar el estado de cualquier rifa a cualquiera
--    de los 5 estados soportados ('draft', 'active', 'paused', 'closed', 'finished'),
--    incluso si la rifa se encuentra actualmente en estado 'finished' (reutilización).
-- 2. Eliminar las restricciones de estado terminal en los triggers de public.raffles.
-- 3. Actualizar la RPC admin_update_raffle para permitir transiciones libres
--    y garantizar que si una rifa pasa a 'active', cualquier otra rifa activa
--    pase automáticamente a 'paused'.
-- ==============================================================================

-- 1. Eliminar o relajar los triggers de estado terminal en public.raffles
DROP TRIGGER IF EXISTS trg_validate_raffle_terminal_status ON public.raffles;
DROP TRIGGER IF EXISTS trg_validate_raffle_status_transition ON public.raffles;

-- 2. Actualizar función del trigger de máquina de estados para validar únicamente estados canónicos
CREATE OR REPLACE FUNCTION public.fn_validate_raffle_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Si el estado no cambia, permitir
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validar que el nuevo estado sea uno de los 5 estados canónicos del sistema
    IF NEW.status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RAISE EXCEPTION 'Violación de Integridad: Estado de rifa "%" no válido. Estados permitidos: draft, active, paused, closed, finished.', NEW.status
            USING ERRCODE = '42501';
    END IF;

    -- Se permite cualquier transición entre los 5 estados para permitir reutilización y control administrativo total
    RETURN NEW;
END;
$$;

-- Asegurar que el trigger esté asignado con la función flexible
DROP TRIGGER IF EXISTS trg_validate_raffle_state_machine ON public.raffles;
CREATE TRIGGER trg_validate_raffle_state_machine
    BEFORE UPDATE OF status ON public.raffles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_raffle_state_machine();

-- 3. Actualizar función de transición residual (si existe) para compatibilidad
CREATE OR REPLACE FUNCTION public.fn_validate_raffle_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Permitir todas las transiciones entre estados válidos
    RETURN NEW;
END;
$$;

-- 4. Actualizar admin_update_raffle sin la restricción terminal y con auto-pausa de rifas competidoras
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean TEXT;
    v_desc_clean TEXT;
    v_lottery_clean TEXT;
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

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    -- 3. Bloqueo pesimista de la rifa e inspección del estado actual
    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'La rifa especificada no existe.');
    END IF;

    -- 4. Si se activa esta rifa, pausar cualquier otra rifa actualmente activa para garantizar unicidad pública
    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active' AND id <> p_raffle_id;
    END IF;

    -- 5. Actualización atómica de la rifa
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

    -- 6. Registro estructurado en audit_logs
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
        'raffle', row_to_json(v_new_raffle)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_raffle(uuid, text, text, numeric, timestamp with time zone, text, text, integer) TO authenticated, service_role;
