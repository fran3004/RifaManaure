-- ==============================================================================
-- Migración 021: Gestión Oficial de Ganadores del Sorteo (Tabla, RPC y Storage)
-- ==============================================================================

-- 1. Crear tabla public.winners
CREATE TABLE IF NOT EXISTS public.winners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
    ticket_number VARCHAR(10) NOT NULL,
    lottery_draw_number VARCHAR(20) NOT NULL,
    draw_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    official_act_url TEXT,
    delivery_photos TEXT[] DEFAULT '{}',
    notes TEXT,
    registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_winners_raffle_id ON public.winners(raffle_id);
CREATE INDEX IF NOT EXISTS idx_winners_order_id ON public.winners(order_id);
CREATE INDEX IF NOT EXISTS idx_winners_buyer_id ON public.winners(buyer_id);
CREATE INDEX IF NOT EXISTS idx_winners_ticket_number ON public.winners(ticket_number);

-- 2. Habilitar RLS en public.winners
ALTER TABLE public.winners ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (para mostrar ganadores en la web y panel)
DROP POLICY IF EXISTS "Lectura pública de ganadores" ON public.winners;
CREATE POLICY "Lectura pública de ganadores" 
ON public.winners FOR SELECT 
TO public 
USING (true);

-- Política de gestión total para administradores
DROP POLICY IF EXISTS "Administradores pueden gestionar ganadores" ON public.winners;
CREATE POLICY "Administradores pueden gestionar ganadores" 
ON public.winners FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. Configurar Bucket de Storage 'winner-documents' para Actas y Fotos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'winner-documents',
    'winner-documents',
    true, -- Acceso de lectura pública para exhibir actas y fotos oficiales
    10485760, -- 10 MB máximo por archivo
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Políticas de Storage para 'winner-documents'
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
CREATE POLICY "Lectura pública de documentos de ganadores" ON storage.objects
    FOR SELECT USING (bucket_id = 'winner-documents');

DROP POLICY IF EXISTS "Solo administradores pueden subir documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden subir documentos de ganadores" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects
    FOR UPDATE USING (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects;
CREATE POLICY "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects
    FOR DELETE USING (bucket_id = 'winner-documents' AND public.is_admin(auth.uid()));

-- 4. RPC para Registrar Ganador (register_winner) con SECURITY DEFINER
DROP FUNCTION IF EXISTS public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT);

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
    -- 1. Validar autorización administrativa
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    -- 2. Validar parámetros requeridos
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

    -- 3. Obtener título de la rifa
    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    -- 4. Buscar el boleto con su orden y comprador asociado (Bloqueo pesimista)
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

    -- 5. Validar que el boleto esté efectivamente VENDIDO
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

    -- 6. Insertar el registro en public.winners
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

    -- 7. Actualizar el estado de la rifa a 'finished'
    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    -- 8. Registrar en la bitácora de auditoría
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

-- 5. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;

