-- ============================================================================
-- MIGRACIÓN 041: LIMPIEZA DE STORAGE Y BLINDAJE DE INTEGRIDAD SECUNDARIA
-- Hallazgos: DB-12, DB-15, DB-16
-- ============================================================================

-- ============================================================================
-- 1. DB-12 (STORAGE): PURGADO DE POLÍTICAS RLS HUÉRFANAS PARA BUCKETS INEXISTENTES
-- ============================================================================
-- Los módulos de aliados (partner-logos), premios (prize-images) y documentos de
-- ganadores (winner-documents) fueron migrados a Cloudinary mediante la Edge
-- Function 'cloudinary-sign' (carpeta manaure-vive/*).
-- Los buckets correspondientes nunca fueron creados o quedaron desiertos en storage.buckets.
-- Se eliminan de forma segura las políticas RLS huérfanas en storage.objects para
-- evitar evaluaciones innecesarias y clarificar la arquitectura de almacenamiento.
--
-- NOTA CRÍTICA DE PROTECCIÓN:
-- NO se tocan los buckets legítimos activos ni sus políticas:
--   - payment-proofs (privado, comprobantes de pago de compradores)
--   - receipts (público legado, resolución de enlaces históricos)
--   - gallery-images (público activo, galería comunitaria)

-- 1.1 Políticas huérfanas de partner-logos
DROP POLICY IF EXISTS "Lectura pública de logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden subir logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar logos de aliados" ON storage.objects;

-- 1.2 Políticas huérfanas de prize-images
DROP POLICY IF EXISTS "Lectura pública de imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores suben imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores actualizan imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores eliminan imágenes de premios" ON storage.objects;

-- 1.3 Políticas huérfanas de winner-documents
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden subir documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects;

-- 1.4 Nota sobre storage.buckets:
-- Supabase bloquea eliminaciones directas de tipo DELETE FROM storage.buckets
-- mediante la función de seguridad storage.protect_delete().
-- En producción, estos 3 buckets ('partner-logos', 'prize-images', 'winner-documents')
-- nunca fueron creados en storage.buckets. Si en algún entorno llegaran a existir,
-- Supabase exige su eliminación manual desde el Dashboard (Storage > Settings > Delete bucket)
-- o mediante la Storage API (supabase.storage.deleteBucket), nunca por SQL directo.


-- ============================================================================
-- 2. DB-15 (WINNERS): CONSTRAINT ÚNICO E IDEMPOTENCIA EN REGISTRO DE GANADORES
-- ============================================================================
-- Impide que dos procesos concurrentes o un doble clic administrativo registren
-- dos veces el mismo boleto premiado para la misma rifa.

-- 2.1 Constraint UNIQUE e Índice en winners(raffle_id, ticket_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_winners_raffle_ticket'
  ) THEN
    ALTER TABLE public.winners 
      ADD CONSTRAINT uq_winners_raffle_ticket UNIQUE (raffle_id, ticket_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_winners_raffle_ticket 
  ON public.winners(raffle_id, ticket_number);

-- 2.2 Reemplazo de register_winner con validación de idempotencia y captura de unique_violation
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
SET search_path = public, pg_temp
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
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    -- 2. Validaciones de Parámetros Obligatorios
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_clean_ticket_number := TRIM(COALESCE(p_ticket_number, ''));
    IF v_clean_ticket_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número del boleto ganador es obligatorio.');
    END IF;

    v_clean_lottery_number := TRIM(COALESCE(p_lottery_draw_number, ''));
    IF v_clean_lottery_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de sorteo de la lotería oficial es obligatorio.');
    END IF;

    -- 3. Verificar Existencia de la Rifa
    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    -- 4. Idempotencia Temprana (DB-15): Verificar si ya existe ganador registrado para este boleto
    IF EXISTS (
        SELECT 1 FROM public.winners 
        WHERE raffle_id = p_raffle_id 
          AND (ticket_number = v_clean_ticket_number OR ticket_number = LPAD(v_clean_ticket_number, 3, '0'))
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
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
            'error', 'El número de boleto "' || v_clean_ticket_number || '" no existe en la emisión de esta rifa.'
        );
    END IF;

    -- 6. Validación de Estado Comercial: Solo boletos 'sold' pueden premiarse
    IF v_ticket.ticket_status <> 'sold' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto "' || v_ticket.ticket_number || '" no puede registrarse como ganador porque no está vendido (Estado actual: ' || v_ticket.ticket_status || '). Solo boletos con pago confirmado pueden ser ganadores.'
        );
    END IF;

    v_order_id := COALESCE(v_ticket.ticket_order_id, v_ticket.order_id);
    v_buyer_id := COALESCE(v_ticket.ticket_buyer_id, v_ticket.order_buyer_id, v_ticket.buyer_id);

    IF v_order_id IS NULL OR v_buyer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
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
                'error', 'Conflicto de concurrencia: el boleto "' || v_clean_ticket_number || '" ya fue registrado como ganador por otro proceso concurrente.'
            );
    END;

    -- 8. Finalización de la Rifa
    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    -- 9. Trazabilidad en Audit Logs
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'WINNER_REGISTERED',
        'winners',
        v_winner.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'raffle_title', v_raffle_title,
            'ticket_number', v_ticket.ticket_number,
            'lottery_draw_number', v_clean_lottery_number,
            'buyer_id', v_buyer_id,
            'buyer_name', v_ticket.buyer_name,
            'buyer_document', v_ticket.buyer_document,
            'order_id', v_order_id,
            'order_reference', v_ticket.order_reference,
            'draw_date', v_winner.draw_date,
            'official_act_url', v_winner.official_act_url,
            'registered_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'winner_id', v_winner.id,
        'ticket_number', v_winner.ticket_number,
        'lottery_draw_number', v_winner.lottery_draw_number,
        'draw_date', v_winner.draw_date,
        'buyer_name', v_ticket.buyer_name,
        'buyer_document', v_ticket.buyer_document,
        'order_reference', v_ticket.order_reference,
        'message', '¡Ganador registrado exitosamente con toda su evidencia!'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;


-- ============================================================================
-- 3. DB-16 (IS_ADMIN): CLARIDAD SEMÁNTICA Y PROTECCIÓN ANTI-SUPLANTACIÓN
-- ============================================================================
-- Conserva la firma p_user_id UUID DEFAULT auth.uid() para total compatibilidad
-- con las 38 políticas RLS existentes sin incurrir en cascade-drops de políticas.
-- Se añade validación estricta que deniega de inmediato (false) si un invocador
-- proporciona un UUID arbitrario diferente a auth.uid(), eliminando la ambigüedad
-- y previniendo que un usuario intente consultar o asumir el rol de otro usuario.

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Endurecimiento DB-16: Si se suministra un UUID explícito que no coincide con
  -- el usuario autenticado real, rechazar de inmediato para evitar confusión y enumeración.
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Endurecimiento DB-16: Rechazo inmediato ante discrepancia de identidad
  IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = v_uid OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO anon, authenticated, service_role;

