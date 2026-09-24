-- ==============================================================================
-- MIGRACIÓN 054: Cierre Total del Bucket Legacy 'receipts' y Purga de Políticas Huérfanas
-- Auditoría 05 — Remediación 3 (EVENT-03, EVENT-04, EVENT-09)
-- ==============================================================================
-- OBJETIVO:
-- 1. Cerrar completamente el bucket legacy 'receipts':
--    - Forzar public = false en storage.buckets.
--    - Fijar cuota máxima en 5 MB (5242880 bytes).
--    - Restringir allowed_mime_types a ('image/jpeg', 'image/png', 'image/webp', 'application/pdf').
--    - Revocar cualquier permiso o política de inserción, actualización o eliminación anónima/pública.
--    - Preservar lectura histórica exclusivamente para administradores autenticados vía signed URLs.
-- 2. Confirmar blindaje del bucket activo 'payment-proofs':
--    - public = false, cuota 5 MB, allowlist segura.
--    - Inserción vinculada a orden pendiente mediante fn_is_order_pending_proof.
--    - Lectura exclusiva para administradores.
-- 3. Blindaje de 'gallery-images':
--    - Confirmar exclusión taxativa de 'image/svg+xml' (prevención de Stored XSS).
--    - Formatos fotográficos permitidos: JPEG, PNG, WebP, AVIF.
-- 4. Purga integral de políticas RLS huérfanas en storage.objects para buckets inexistentes:
--    - partner-logos
--    - prize-images
--    - winner-documents
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENING INTEGRAL DE storage.buckets (receipts, payment-proofs, gallery-images)
-- ------------------------------------------------------------------------------
UPDATE storage.buckets
SET 
    public = false,
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'receipts';

UPDATE storage.buckets
SET 
    public = false,
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'payment-proofs';

UPDATE storage.buckets
SET 
    public = true,
    file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
WHERE id = 'gallery-images';

-- ------------------------------------------------------------------------------
-- 2. REVOCACIÓN TOTAL DE ESCRITURAS Y POLÍTICAS PÚBLICAS EN 'receipts'
-- ------------------------------------------------------------------------------
-- Purgar cualquier política histórica de subida o mutación en receipts
DROP POLICY IF EXISTS "Subida pública de comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public receipts upload" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública de comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Public access receipts" ON storage.objects;

-- Asegurar que la única política en 'receipts' sea SELECT para administradores verificados
DROP POLICY IF EXISTS "Administradores pueden listar y leer comprobantes" ON storage.objects;
CREATE POLICY "Administradores pueden listar y leer comprobantes" 
ON storage.objects
FOR SELECT 
TO authenticated
USING (bucket_id = 'receipts' AND public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 3. CONFIRMAR POLÍTICAS DE 'payment-proofs' (BUCKET ACTIVO DE COMPROBANTES)
-- ------------------------------------------------------------------------------
-- Lectura estrictamente administrativa
DROP POLICY IF EXISTS "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects;
CREATE POLICY "Solo administradores pueden leer comprobantes de payment-proofs" 
ON storage.objects
FOR SELECT 
TO authenticated
USING (bucket_id = 'payment-proofs' AND public.is_admin(auth.uid()));

-- Inserción controlada vinculada exclusivamente a órdenes pendientes
DROP POLICY IF EXISTS "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects;
CREATE POLICY "Compradores pueden subir comprobantes a payment-proofs" 
ON storage.objects
FOR INSERT 
TO public
WITH CHECK (
    bucket_id = 'payment-proofs' 
    AND public.fn_is_order_pending_proof(storage.objects.name)
);

-- ------------------------------------------------------------------------------
-- 4. CONFIRMAR POLÍTICAS DE 'gallery-images' (FOTOGRAFÍAS PÚBLICAS)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura pública de fotos de galería" ON storage.objects;
CREATE POLICY "Lectura pública de fotos de galería" 
ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'gallery-images');

DROP POLICY IF EXISTS "Solo administradores suben fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores suben fotos de galería" 
ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores actualizan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores actualizan fotos de galería" 
ON storage.objects
FOR UPDATE 
TO authenticated
USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores eliminan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores eliminan fotos de galería" 
ON storage.objects
FOR DELETE 
TO authenticated
USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. PURGA INTEGRAL DE POLÍTICAS RLS HUÉRFANAS PARA BUCKETS INEXISTENTES
-- ------------------------------------------------------------------------------
-- 5.1 Políticas huérfanas de partner-logos
DROP POLICY IF EXISTS "Lectura pública de logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden subir logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar logos de aliados" ON storage.objects;
DROP POLICY IF EXISTS "Public access partner logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload partner logos" ON storage.objects;

-- 5.2 Políticas huérfanas de prize-images
DROP POLICY IF EXISTS "Lectura pública de imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores suben imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores actualizan imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores eliminan imágenes de premios" ON storage.objects;
DROP POLICY IF EXISTS "Public access prize images" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload prize images" ON storage.objects;

-- 5.3 Políticas huérfanas de winner-documents
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden subir documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Public access winner documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload winner documents" ON storage.objects;

-- ------------------------------------------------------------------------------
-- 6. COMENTARIOS EN CATÁLOGO DE POSTGRESQL
-- ------------------------------------------------------------------------------
COMMENT ON POLICY "Administradores pueden listar y leer comprobantes" ON storage.objects IS 
'Bucket legacy receipts cerrado a escrituras; lectura exclusiva para administradores autenticados vía URLs firmadas (EVENT-03 / EVENT-04).';

COMMENT ON POLICY "Solo administradores pueden leer comprobantes de payment-proofs" ON storage.objects IS 
'Lectura segura de comprobantes en payment-proofs restringida exclusivamente a administradores verificados (SEC-05 / EVENT-04).';

COMMENT ON POLICY "Compradores pueden subir comprobantes a payment-proofs" ON storage.objects IS 
'Subida de comprobantes vinculada atómicamente a una orden pendiente mediante fn_is_order_pending_proof (SEC-05).';
