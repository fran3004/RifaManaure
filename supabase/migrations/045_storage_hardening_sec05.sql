-- ==============================================================================
-- Migración 045: Hardening Controlado de Supabase Storage (SEC-05)
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- HALLAZGO ATENDIDO: SEC-05 (Riesgo en Almacenamiento Supabase: Subida Anónima
--                    Ilimitada en receipts y Riesgo de Stored XSS por SVG en gallery-images)
--
-- ACCIONES EJECUTADAS:
-- 1. BUCKET 'receipts':
--    - Revocar la política "Subida pública de comprobantes" (elimina subida anónima).
--    - Configurar en storage.buckets: public = false (privado), cuota = 5 MB,
--      allowed_mime_types restrictivo (JPEG, PNG, WebP, PDF).
--    - Preservar política SELECT exclusivamente para administradores autenticados
--      (is_admin), permitiendo resolución segura de URLs firmadas históricas.
--
-- 2. BUCKET 'payment-proofs':
--    - Confirmar estado privado (public = false) y límite de 5 MB con allowlist estricta.
--    - Blindar política SELECT para lectura exclusiva de administradores autenticados.
--    - Función auxiliar SECURITY DEFINER fn_is_order_pending_proof para validar
--      que el path apunte a una orden en 'pending' o 'pending_verification' sin
--      abrir permisos directos sobre public.orders a anon.
--
-- 3. BUCKET 'gallery-images':
--    - Eliminar 'image/svg+xml' de allowed_mime_types en storage.buckets, cerrando
--      el vector de Stored XSS en Storage.
--    - Restringir allowed_mime_types a formatos fotográficos: JPEG, PNG, WebP, AVIF.
--    - Límite de 10 MB preservado y mutaciones exclusivas para administradores.
-- ==============================================================================

-- 1. HARDENING DE METADATOS Y LIMITACIONES EN storage.buckets
UPDATE storage.buckets
SET 
    public = false,
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'receipts';

UPDATE storage.buckets
SET 
    public = false,
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'payment-proofs';

UPDATE storage.buckets
SET 
    public = true,
    file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
WHERE id = 'gallery-images';

-- 2. ELIMINACIÓN DE LA SUBIDA ANÓNIMA EN 'receipts'
-- Se elimina la política vulnerable que permitía inserción anónima irrestricta
DROP POLICY IF EXISTS "Subida pública de comprobantes" ON storage.objects;

-- 3. POLÍTICAS RLS EN storage.objects PARA BUCKET 'receipts'
-- Solo administradores pueden listar y leer comprobantes históricos (para URLs firmadas)
DROP POLICY IF EXISTS "Administradores pueden listar y leer comprobantes" ON storage.objects;
CREATE POLICY "Administradores pueden listar y leer comprobantes" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'receipts' AND public.is_admin(auth.uid()));

-- 4. POLÍTICAS RLS EN storage.objects PARA BUCKET 'payment-proofs'
-- Lectura estrictamente administrativa
DROP POLICY IF EXISTS "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects;
CREATE POLICY "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'payment-proofs' AND public.is_admin(auth.uid()));

-- Función auxiliar SECURITY DEFINER para validar que la orden referenciada en la ruta exista
-- y esté en estado pendiente, sin requerir exponer la tabla orders con permisos directos de SELECT a anon.
CREATE OR REPLACE FUNCTION public.fn_is_order_pending_proof(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_id_str text;
    v_order_uuid uuid;
BEGIN
    -- El formato estándar del path en paymentService.ts es:
    -- proofs/<raffle_id>/<order_id>/<filename> (posición 3)
    -- o alternativamente: proofs/<order_id>/<filename> (posición 2)
    v_order_id_str := split_part(p_object_name, '/', 3);
    IF v_order_id_str IS NULL OR v_order_id_str = '' THEN
        v_order_id_str := split_part(p_object_name, '/', 2);
    END IF;

    IF v_order_id_str IS NULL OR v_order_id_str = '' THEN
        RETURN false;
    END IF;

    BEGIN
        v_order_uuid := v_order_id_str::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    RETURN EXISTS (
        SELECT 1 FROM public.orders
        WHERE id = v_order_uuid
          AND status IN ('pending', 'pending_verification')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_order_pending_proof(text) TO anon, authenticated, service_role;

-- Inserción controlada vinculada exclusivamente a órdenes activas evaluada mediante la función segura
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;
CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects
    FOR INSERT TO public
    WITH CHECK (
        bucket_id = 'payment-proofs' 
        AND public.fn_is_order_pending_proof(storage.objects.name)
    );

-- 5. POLÍTICAS RLS EN storage.objects PARA BUCKET 'gallery-images'
DROP POLICY IF EXISTS "Lectura pública de fotos de galería" ON storage.objects;
CREATE POLICY "Lectura pública de fotos de galería" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'gallery-images');

DROP POLICY IF EXISTS "Solo administradores suben fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores suben fotos de galería" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores actualizan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores actualizan fotos de galería" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores eliminan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores eliminan fotos de galería" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

-- 6. COMENTARIOS EN CATÁLOGO
COMMENT ON POLICY "Administradores pueden listar y leer comprobantes" ON storage.objects IS 'Lectura de comprobantes históricos en receipts exclusiva para administradores vía URLs firmadas (SEC-05).';
COMMENT ON POLICY "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects IS 'Lectura segura de comprobantes en payment-proofs exclusiva para administradores (SEC-05).';
COMMENT ON FUNCTION public.fn_is_order_pending_proof(text) IS 'Valida de forma segura (SECURITY DEFINER) si el comprobante apunta a una orden en estado pendiente o en verificación (SEC-05).';
COMMENT ON POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects IS 'Subida de comprobantes permitida únicamente a la ruta de una orden pendiente o en verificación (SEC-05).';

