-- ==============================================================================
-- Migración 061: Restauración del Bucket 'winner-documents' en Supabase Storage
-- ==============================================================================
-- Justificación y Contexto:
-- Cloudinary restringe de forma predeterminada la entrega y visualización directa
-- en el navegador de documentos PDF (error HTTP 401 / descarga forzada), lo cual
-- impide que visitantes y administradores consulten con fluidez las actas oficiales.
--
-- Por lo tanto, se restablece el almacenamiento canónico de actas de ganadores
-- exclusivamente en Supabase Storage (bucket 'winner-documents'), garantizando
-- lectura pública directa con cabecera Content-Type 'application/pdf' nativa,
-- mientras la subida, actualización y eliminación quedan estrictamente reservadas
-- a usuarios con rol administrativo activo (public.is_admin).
-- ==============================================================================

-- 1. Crear / Asegurar Bucket 'winner-documents' en storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'winner-documents',
    'winner-documents',
    true, -- Acceso de lectura pública para exhibición y verificación de actas oficiales
    10485760, -- 10 MB máximo por documento PDF
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf'];

-- 2. Políticas RLS en storage.objects para 'winner-documents'

-- 2.1 Lectura pública (SELECT) de actas oficiales en PDF
DROP POLICY IF EXISTS "Lectura pública de actas de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer documentos de ganadores" ON storage.objects;

CREATE POLICY "Lectura pública de actas de ganadores"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'winner-documents');

-- 2.2 Subida exclusiva para administradores (INSERT)
DROP POLICY IF EXISTS "Solo administradores pueden subir actas de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden subir documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload winner documents" ON storage.objects;

CREATE POLICY "Solo administradores pueden subir actas de ganadores"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'winner-documents' 
    AND public.is_admin(auth.uid())
);

-- 2.3 Actualización exclusiva para administradores (UPDATE)
DROP POLICY IF EXISTS "Solo administradores pueden actualizar actas de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden actualizar documentos de ganadores" ON storage.objects;

CREATE POLICY "Solo administradores pueden actualizar actas de ganadores"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'winner-documents' 
    AND public.is_admin(auth.uid())
);

-- 2.4 Eliminación exclusiva para administradores (DELETE)
DROP POLICY IF EXISTS "Solo administradores pueden eliminar actas de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar documentos de ganadores" ON storage.objects;

CREATE POLICY "Solo administradores pueden eliminar actas de ganadores"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'winner-documents' 
    AND public.is_admin(auth.uid())
);

-- 3. Migración y normalización de URLs en la tabla public.winners
-- Restablece URLs de Supabase Storage en registros históricos si apuntaban a Cloudinary
UPDATE public.winners
SET official_act_url = 'https://bxhzvmbbsisxqpwrgvgn.supabase.co/storage/v1/object/public/winner-documents/actas/a0000000-0000-0000-0000-000000000001/acta_sorteo_1790052588018.pdf'
WHERE id = 'd89645c0-ed00-4e3c-a5b5-8ed3527c09a7'
  AND (official_act_url ILIKE '%cloudinary.com%actas-ganadores%' OR official_act_url IS NULL);
