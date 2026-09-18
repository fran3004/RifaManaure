-- ============================================================================
-- MIGRACIÓN 006: FLUJO INTEGRAL DE COMPROBANTES DE PAGO (BUCKET PRIVADO)
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Crear Bucket Privado 'payment-proofs' en Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false, -- BUCKET PRIVADO (Nunca público)
    5242880, -- 5 MB máximo en bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Políticas RLS en storage.objects para 'payment-proofs'
-- Subida de comprobantes: Compradores pueden subir archivos a 'payment-proofs'
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;
CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'payment-proofs'
    );

-- Lectura segura: ÚNICAMENTE administradores autorizados pueden consultar/descargar comprobantes
-- (Los usuarios normales no tienen acceso directo; se generan URLs firmadas para el admin)
DROP POLICY IF EXISTS "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects;
CREATE POLICY "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'payment-proofs' AND public.is_admin()
    );

-- 3. Tabla de Comprobantes de Pago Asociada a Rifa, Orden, Comprador y Boletos
CREATE TABLE IF NOT EXISTS public.payment_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, -- Ruta interna en el bucket privado 'payment-proofs'
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    payment_reference TEXT,
    rejection_reason TEXT,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON public.payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_raffle ON public.payment_proofs(raffle_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_buyer ON public.payment_proofs(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON public.payment_proofs(status);

-- Habilitar RLS en payment_proofs
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS en payment_proofs
-- A. Administradores: Acceso total para consultar, validar, aprobar o rechazar
DROP POLICY IF EXISTS "Administradores tienen acceso total a payment_proofs" ON public.payment_proofs;
CREATE POLICY "Administradores tienen acceso total a payment_proofs" ON public.payment_proofs
    FOR ALL TO authenticated
    USING (public.is_admin());

-- B. Compradores: Pueden insertar un comprobante para su orden
DROP POLICY IF EXISTS "Compradores pueden registrar comprobante para su orden" ON public.payment_proofs;
CREATE POLICY "Compradores pueden registrar comprobante para su orden" ON public.payment_proofs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = order_id AND status IN ('pending', 'pending_verification')
        )
    );

-- 4. Trigger de updated_at para payment_proofs
CREATE OR REPLACE FUNCTION public.fn_payment_proofs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_proofs_updated_at ON public.payment_proofs;
CREATE TRIGGER trg_payment_proofs_updated_at
    BEFORE UPDATE ON public.payment_proofs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_payment_proofs_updated_at();

-- 5. Función Backend Transaccional: Registrar y Validar Comprobante de Pago
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR(100),
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
BEGIN
    -- 1. Validar existencia y bloquear orden concurrentemente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 2. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 3. Validar tipo de archivo y tamaño
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 4. Insertar registro en public.payment_proofs
    INSERT INTO public.payment_proofs (
        raffle_id,
        order_id,
        buyer_id,
        file_path,
        file_name,
        file_size,
        mime_type,
        status,
        payment_reference
    ) VALUES (
        v_order.raffle_id,
        p_order_id,
        v_order.buyer_id,
        p_file_path,
        p_file_name,
        p_file_size,
        p_mime_type,
        'pending',
        p_payment_reference
    )
    RETURNING id INTO v_proof_id;

    -- 5. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 7. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'PAYMENT_PROOF_SUBMITTED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

-- 6. Actualizar RPCs de Aprobación y Rechazo para sincronizar payment_proofs
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    -- Actualizar orden
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = COALESCE(p_admin_id, auth.uid()),
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Actualizar comprobante(s) asociado(s) a 'approved'
    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = COALESCE(p_admin_id, auth.uid()),
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- Marcar boletos como vendidos definitivamente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    -- Actualizar orden
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = COALESCE(p_admin_id, auth.uid()),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Actualizar comprobante(s) a 'rejected' con el motivo
    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = COALESCE(p_admin_id, auth.uid()),
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- Liberar boletos de vuelta a 'available'
    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

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

