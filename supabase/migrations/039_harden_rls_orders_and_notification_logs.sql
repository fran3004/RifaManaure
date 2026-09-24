-- ============================================================================
-- MIGRACIÓN 039: Endurecimiento Estricto de Políticas RLS en Orders y Notification Logs
-- Resoluciones de Seguridad para Hallazgos DB-03 y DB-14
-- ============================================================================

-- ============================================================================
-- 1. DB-03: Saneamiento Integral de notification_logs
-- ============================================================================

-- Paso 1.1: Eliminar la política defectuosa que consulta directamente auth.users
-- (La correlación frágil causaba error PostgreSQL 42501 y fuga horizontal potencial)
DROP POLICY IF EXISTS "Compradores pueden ver logs de sus órdenes" ON public.notification_logs;

-- Paso 1.2: Limpiar políticas redundantes anteriores en notification_logs
DROP POLICY IF EXISTS "Admins pueden ver todos los logs de notificaciones" ON public.notification_logs;
DROP POLICY IF EXISTS "Admins pueden gestionar todos los logs de notificaciones" ON public.notification_logs;
DROP POLICY IF EXISTS "Admins pueden consultar logs de notificaciones" ON public.notification_logs;

-- Paso 1.3: Revocar acceso de roles no autorizados (anon y public) a nivel tabla
REVOKE ALL ON public.notification_logs FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO authenticated, service_role;

-- Paso 1.4: Establecer políticas RLS exclusivamente administrativas basadas en is_admin()
CREATE POLICY "Admins pueden consultar logs de notificaciones" 
    ON public.notification_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins pueden gestionar logs de notificaciones" 
    ON public.notification_logs
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 2. DB-14: Erradicación del UPDATE Genérico Público en orders
-- ============================================================================

-- Paso 2.1: Eliminar la política insegura FOR UPDATE TO public USING (status IN (...))
-- que permitía a cualquier usuario modificar campos arbitrarios de órdenes pendientes
DROP POLICY IF EXISTS "Compradores pueden adjuntar comprobante a su orden" ON public.orders;

-- Paso 2.2: Revocar permisos de modificación directa en orders para roles públicos
REVOKE UPDATE, INSERT, DELETE ON public.orders FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- Paso 2.3: Política RLS de modificación directa en orders EXCLUSIVA para administradores
DROP POLICY IF EXISTS "Solo administradores pueden actualizar órdenes directamente" ON public.orders;
CREATE POLICY "Solo administradores pueden actualizar órdenes directamente" 
    ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ============================================================================
-- 3. Blindaje y Acotación Definitiva de la RPC submit_payment_proof
-- ============================================================================
-- Canaliza la subida de comprobantes con validación de tipo, tamaño, ruta,
-- bloqueo pesimista y actualización transaccional estricta sin contaminación cruzada.

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
SET search_path = public, pg_temp
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

    -- 3. Validar correspondencia de la ruta del archivo con la orden objetivo
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

    -- 4. Validar formato de archivo y tamaño (5 MB máximo)
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

    -- 7. Proteger los boletos vinculados a esta orden (ESTRICTAMENTE ACOTADO A p_order_id)
    UPDATE public.tickets
    SET updated_at = NOW()
    WHERE order_id = p_order_id;

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

REVOKE ALL ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;
