-- ============================================================================
-- MIGRACIÓN 025: GESTIÓN COMPLETA DE ALIADOS Y CONVENIOS (public.partners)
-- ============================================================================
-- 1. Asegurar columnas logo_url y updated_at en public.partners
-- 2. Políticas RLS para lectura pública y administración total por administradores
-- 3. Trigger de updated_at para control de auditoría
-- 4. Bucket de Supabase Storage 'partner-logos' con políticas de acceso
-- 5. Migración de datos iniciales desde src/assets/assets.ts
-- ============================================================================

-- 1. Añadir columnas a public.partners
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Asegurar RLS en public.partners
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- 2.1 Lectura pública: Solo aliados activos
DROP POLICY IF EXISTS "Lectura pública de aliados" ON public.partners;
CREATE POLICY "Lectura pública de aliados" ON public.partners
    FOR SELECT
    USING (is_active = true);

-- 2.2 Administradores: Acceso completo (SELECT todos, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Administradores pueden gestionar aliados" ON public.partners;
CREATE POLICY "Administradores pueden gestionar aliados" ON public.partners
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 3. Trigger para actualizar automáticamente updated_at
CREATE OR REPLACE FUNCTION public.fn_partners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
CREATE TRIGGER trg_partners_updated_at
    BEFORE UPDATE ON public.partners
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_partners_updated_at();

-- 4. Bucket de Supabase Storage para logotipos de aliados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'partner-logos',
    'partner-logos',
    true, -- Acceso público para renderizado en landing y portal
    5242880, -- 5 MB máximo por imagen
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- Políticas de Storage para 'partner-logos'
DROP POLICY IF EXISTS "Lectura pública de logos de aliados" ON storage.objects;
CREATE POLICY "Lectura pública de logos de aliados" ON storage.objects
    FOR SELECT USING (bucket_id = 'partner-logos');

DROP POLICY IF EXISTS "Solo administradores pueden subir logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden subir logos de aliados" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden actualizar logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden actualizar logos de aliados" ON storage.objects
    FOR UPDATE USING (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores pueden eliminar logos de aliados" ON storage.objects;
CREATE POLICY "Solo administradores pueden eliminar logos de aliados" ON storage.objects
    FOR DELETE USING (bucket_id = 'partner-logos' AND public.is_admin(auth.uid()));

-- 5. Migración / Actualización de los 10 Aliados Oficiales desde src/assets/assets.ts con sus enlaces oficiales
INSERT INTO public.partners (slug, name, category, description, instagram_url, display_order, is_active)
VALUES
    (
        'photours',
        'PHOTours',
        'Fotografía y contenido audiovisual',
        'Fotografía profesional y contenido audiovisual para experiencias ecoturísticas en la Serranía.',
        'https://www.instagram.com/photour_?stkn=ZDNlZDc0MzIxNw==',
        1,
        true
    ),
    (
        'cuatri-tours-manaure',
        'Cuatri Tours Manaure',
        'Aventura en cuatrimotos y rutas',
        'Rutas guiadas en cuatrimotos por los senderos y miradores de la Serranía del Perijá.',
        'https://www.instagram.com/cuatritours_manaure?stkn=ZDNlZDc0MzIxNw==',
        2,
        true
    ),
    (
        'villa-adelaida',
        'Villa Adelaida',
        'Hospedaje campestre y ecoturismo',
        'Hospedaje campestre, descanso y conexión con la naturaleza en Manaure Balcón del Cesar.',
        'https://www.instagram.com/restaurantevilladelaida?stkn=ZDNlZDc0MzIxNw==',
        3,
        true
    ),
    (
        'absolom-casita-de-la-mora',
        'Absolom - La Casita de la Mora',
        'Sabores y dulces tradicionales',
        'Postres artesanales, dulces típicos de mora y gastronomía local representativa.',
        'https://www.instagram.com/lacasitadelamora?stkn=ZDNlZDc0MzIxNw==',
        4,
        true
    ),
    (
        'los-pinos-manaure',
        'Los Pinos Manaure',
        'Mirador, naturaleza y paisajes',
        'Mirador panorámico, senderismo ecológico y avistamiento de atardeceres en Perijá.',
        'https://www.instagram.com/lospinosmanaure?stkn=ZDNlZDc0MzIxNw==',
        5,
        true
    ),
    (
        'mashiramo-glamping',
        'Mashiramo Glamping',
        'Glamping y descanso en la naturaleza',
        'Experiencia de glamping de lujo y hospedaje exclusivo en el corazón de la montaña.',
        'https://www.instagram.com/mashiramo_glamping?stkn=ZDNlZDc0MzIxNw==',
        6,
        true
    ),
    (
        'la-casa-de-las-arepas',
        'La Casa de las Arepas',
        'Gastronomía típica local',
        'Comida tradicional cesarense y arepas artesanales con auténtico sabor local.',
        NULL,
        7,
        true
    ),
    (
        'metallura',
        'Metallura Nature Tourism',
        'Avistamiento de aves (Birdwatching)',
        'Tours especializados de avistamiento de aves y conservación en la Serranía del Perijá.',
        'https://www.instagram.com/metalluraturismo?stkn=ZDNlZDc0MzIxNw==',
        8,
        true
    ),
    (
        'manaure-aventura',
        'Manaure Aventura',
        'Deportes extremos y vuelos en parapente',
        'Vuelos biplaza en parapente y turismo de adrenalina sobre el hermoso valle de Manaure.',
        'https://www.instagram.com/manaureaventura?stkn=ZDNlZDc0MzIxNw==',
        9,
        true
    ),
    (
        'coruscans',
        'Coruscans',
        'Productos y artesanías locales',
        'Café especial, artesanías y productos autóctonos cultivados por familias de la región.',
        'https://www.instagram.com/elcoruscans?stkn=ZDNlZDc0MzIxNw==',
        10,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = COALESCE(public.partners.description, EXCLUDED.description),
    instagram_url = COALESCE(EXCLUDED.instagram_url, public.partners.instagram_url),
    display_order = EXCLUDED.display_order;


