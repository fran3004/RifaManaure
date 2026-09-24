-- ==============================================================================
-- MIGRACIÓN 048: Gobernanza de Ganadores y Máquina de Estados de Rifas
--
-- HALLAZGOS:
-- 1. BYPASS DIRECTO EN WINNERS: Eliminación de mutación directa en public.winners;
--    register_winner queda establecida como única vía autorizada.
-- 2. REAPERTURA DE RIFAS FINISHED: Blindaje del estado terminal 'finished' en raffles
--    impidiendo reaperturas ilegítimas a 'active', 'paused' o 'closed'.
--
-- REMEDIACIÓN IMPLEMENTADA:
-- 1. winners:
--    - Revocación de permisos INSERT, UPDATE, DELETE, TRUNCATE a anon y authenticated.
--    - Eliminación de la policy RLS "Administradores pueden gestionar ganadores" que
--      concedía permisos ALL a clientes PostgREST.
--    - Preservación exclusiva de la política SELECT "Lectura pública de ganadores" para transparencia.
--    - Preservación de register_winner con SECURITY DEFINER para mutaciones validadas y auditadas.
-- 2. raffles:
--    - Actualización de admin_update_raffle con validación estricta que prohíbe transiciones
--      desde 'finished' hacia cualquier otro estado.
--    - Trigger de defensa en profundidad trg_validate_raffle_status_transition a nivel
--      de tabla sobre public.raffles BEFORE UPDATE OF status.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: HARDENING DE MUTACIONES SOBRE PUBLIC.WINNERS
-- ==============================================================================

-- 1.1 Revocar privilegios de mutación directa a clientes de PostgREST
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.winners FROM PUBLIC, anon, authenticated;

-- 1.2 Garantizar permiso de lectura pública
GRANT SELECT ON TABLE public.winners TO anon, authenticated, service_role;

-- 1.3 Eliminar política permisiva de mutación directa para administradores
DROP POLICY IF EXISTS "Administradores pueden gestionar ganadores" ON public.winners;

-- 1.4 Reafirmar política de solo lectura pública transparente
DROP POLICY IF EXISTS "Lectura pública de ganadores" ON public.winners;
CREATE POLICY "Lectura pública de ganadores" 
ON public.winners 
FOR SELECT 
USING (true);

-- 1.5 Asegurar permisos de ejecución en register_winner
GRANT EXECUTE ON FUNCTION public.register_winner(
    uuid, text, text, timestamptz, text, text[], text
) TO authenticated, service_role;


-- ==============================================================================
-- SECCIÓN 2: BLINDAJE DE ESTADO TERMINAL 'FINISHED' EN PUBLIC.RAFFLES
-- ==============================================================================

-- 2.1 Trigger de integridad a nivel de motor de base de datos
CREATE OR REPLACE FUNCTION public.fn_validate_raffle_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Regla terminal: Si la rifa ya está finalizada, no puede pasar a ningún otro estado
    IF OLD.status = 'finished' AND NEW.status <> 'finished' THEN
        RAISE EXCEPTION 'Violación de Integridad: Una rifa en estado "finished" es terminal y no puede ser reabierta ni modificada a "%".', NEW.status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_raffle_status_transition ON public.raffles;
CREATE TRIGGER trg_validate_raffle_status_transition
    BEFORE UPDATE OF status ON public.raffles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_raffle_status_transition();

-- 2.2 Actualización de admin_update_raffle con validación de estado terminal
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
SET search_path TO 'public', 'pg_temp'
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
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    -- 2. Validaciones básicas de parámetros
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    -- 3. Bloqueo y recuperación del estado actual
    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe en el sistema.');
    END IF;

    -- 4. VALIDACIÓN DE MÁQUINA DE ESTADOS: Protección de Rifa Finished
    -- Una rifa finalizada no puede reabrirse a active, paused, closed o draft
    IF v_old_raffle.status = 'finished' AND p_status <> 'finished' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Operación denegada por gobernanza: La rifa ya se encuentra en estado terminal "finished" y no puede reabrirse ni modificarse a otro estado.'
        );
    END IF;

    -- 5. Pausar cualquier otra rifa activa si se pasa esta rifa a 'active'
    IF p_status = 'active' AND v_old_raffle.status <> 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE id <> p_raffle_id AND status = 'active';
    END IF;

    -- 6. Actualización atómica
    UPDATE public.raffles
    SET title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    -- 7. Registro en bitácora de auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED',
        'raffles',
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
            ),
            'updated_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'updated_at', v_new_raffle.updated_at
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_raffle(
    uuid, text, text, numeric, timestamptz, text, text, integer
) TO authenticated, service_role;
