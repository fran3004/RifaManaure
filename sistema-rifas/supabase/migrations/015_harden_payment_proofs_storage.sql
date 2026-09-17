-- ============================================================================
-- MIGRACIÓN 015: ENDURECIMIENTO DE STORAGE Y RUTA DE COMPROBANTES DE PAGO
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================
-- 1. Restringe la política de INSERT en storage.objects para el bucket 'payment-proofs'
--    validando que la ruta contenga un order_id válido en estado 'pending' o 'pending_verification'.
-- 2. Actualiza submit_payment_proof para validar que la ruta del comprobante
--    corresponda estrictamente a la orden que se intenta actualizar.
-- 3. Mantiene los límites de 5 MB y tipos MIME permitidos.
-- ============================================================================

-- 1. Asegurar configuración de límites y tipos MIME del bucket privado 'payment-proofs'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false, -- Privado
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 2. Reemplazar Política de INSERT en storage.objects con Validación de Ruta y Estado de Orden
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;

CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'payment-proofs'
        AND (
            -- Ruta estándar: proofs/{order_id}/{filename}
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id::text = split_part(name, '/', 2)
                AND o.status IN ('pending', 'pending_verification')
            )
            OR
            -- Ruta con prefijo de rifa: proofs/{raffle_id}/{order_id}/{filename}
            EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id::text = split_part(name, '/', 3)
                AND o.status IN ('pending', 'pending_verification')
            )
        )
    );

-- 3. Actualizar función RPC submit_payment_proof con validación de ruta vs order_id
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

    -- 3. Validar correspondencia estricta de la ruta del archivo con la orden objetivo
    IF NOT (
        p_file_path LIKE 'proofs/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'proofs/%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE '%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'data:image/%'
        OR p_file_path LIKE 'data:application/pdf%'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La ruta del comprobante no corresponde al identificador de la orden que se intenta procesar.'
        );
    END IF;

    -- 4. Validar tipo de archivo y tamaño (5 MB máximo)
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

    -- 5. Insertar registro en public.payment_proofs
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

    -- 6. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 8. Registrar evento en auditoría
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

-- 4. Conceder permisos de ejecución para compradores (anon y authenticated) y service_role
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;

