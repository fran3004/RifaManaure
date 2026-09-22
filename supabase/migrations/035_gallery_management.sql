-- ============================================================================
-- MIGRACIÓN 035: GESTIÓN INTEGRAL DE LA GALERÍA FOTOGRÁFICA (gallery_items)
-- ============================================================================
-- 1. Tabla gallery_items para fotos dinámicas de la galería del premio
-- 2. Índices de rendimiento (display_order, category, raffle_id, is_active)
-- 3. Triggers automáticos para updated_at
-- 4. Políticas de Seguridad RLS (Lectura pública y gestión por administradores)
-- 5. Bucket de Supabase Storage 'gallery-images' y políticas de acceso
-- 6. Semilla con el catálogo fotográfico actual de 18 escenas vivenciales
-- ============================================================================

-- 1. Tabla de ítems de la galería
CREATE TABLE IF NOT EXISTS public.gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID REFERENCES public.raffles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'serrania',
    image_slug TEXT,
    image_url TEXT,
    alt_text TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS gallery_items_display_order_idx ON public.gallery_items (display_order ASC);
CREATE INDEX IF NOT EXISTS gallery_items_category_idx ON public.gallery_items (category);
CREATE INDEX IF NOT EXISTS gallery_items_raffle_id_idx ON public.gallery_items (raffle_id);
CREATE INDEX IF NOT EXISTS gallery_items_is_active_idx ON public.gallery_items (is_active);

-- 3. Trigger para actualización automática de updated_at
DROP TRIGGER IF EXISTS trg_gallery_items_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_items_updated_at
    BEFORE UPDATE ON public.gallery_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

-- 4. Políticas Row Level Security (RLS)
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

-- 4.1 Lectura pública de fotos activas (o todas si es administrador autenticado)
DROP POLICY IF EXISTS "gallery_items_public_read" ON public.gallery_items;
CREATE POLICY "gallery_items_public_read" ON public.gallery_items
    FOR SELECT
    USING (
        is_active = true
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

-- 4.2 Mutación exclusiva para administradores
DROP POLICY IF EXISTS "gallery_items_admin_manage" ON public.gallery_items;
CREATE POLICY "gallery_items_admin_manage" ON public.gallery_items
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 5. Bucket de Supabase Storage para fotos de la galería ('gallery-images')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'gallery-images',
    'gallery-images',
    true,
    10485760, -- 10 MB (flexibilidad para fotos de alta calidad sin restricciones rígidas)
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];

-- Políticas de acceso para 'gallery-images'
DROP POLICY IF EXISTS "Lectura pública de fotos de galería" ON storage.objects;
CREATE POLICY "Lectura pública de fotos de galería" ON storage.objects
    FOR SELECT USING (bucket_id = 'gallery-images');

DROP POLICY IF EXISTS "Solo administradores suben fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores suben fotos de galería" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores actualizan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores actualizan fotos de galería" ON storage.objects
    FOR UPDATE USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores eliminan fotos de galería" ON storage.objects;
CREATE POLICY "Solo administradores eliminan fotos de galería" ON storage.objects
    FOR DELETE USING (bucket_id = 'gallery-images' AND public.is_admin(auth.uid()));

-- 6. Semilla inicial con las 18 fotos canónicas actuales de la galería
INSERT INTO public.gallery_items (title, category, image_slug, alt_text, display_order, is_active)
VALUES
    ('Villa Adelaida Campestre', 'hospedaje', 'hospedaje-villa-adelaida', 'Arquitectura campestre y jardines florales en Villa Adelaida', 1, true),
    ('Jardines y Topiarios', 'serrania', 'serrania-topiarios', 'Esculturas vivas y topiarios decorativos en los jardines de Manaure', 2, true),
    ('Aventura en Cuatrimoto por la Cordillera', 'cuatrimoto', 'cuatrimoto-aventura-cordillera', 'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá', 3, true),
    ('Trochas y Rutas Ecoturísticas', 'cuatrimoto', 'cuatrimoto-ruta', 'Recorrido guiado en cuatrimoto a través de caminos de montaña', 4, true),
    ('Mirador Panorámico Cuatrimotos', 'cuatrimoto', 'cuatrimoto-mirador', 'Piloto en cuatrimoto contemplando la inmensidad del valle', 5, true),
    ('Cumbre de la Serranía', 'cuatrimoto', 'cuatrimoto-cumbre', 'Llegada a la cima de la montaña con cuatrimotos todoterreno', 6, true),
    ('Despegue al Atardecer', 'parapente', 'parapente-despegue-atardecer', 'Preparación para el vuelo en parapente biplaza durante la puesta de sol', 7, true),
    ('Vuelo con Bandera de Manaure', 'parapente', 'parapente-bandera', 'Parapentista sobrevolando el cañón portando la bandera representativa', 8, true),
    ('Vuelo Libre sobre el Cañón', 'parapente', 'parapente-vuelo', 'Planeo silencioso sobre las corrientes térmicas de la cordillera', 9, true),
    ('Tándem Extremo en el Cañón', 'parapente', 'parapente-tandem-canon', 'Vuelo tándem seguro con instructor certificado en el cañón de Manaure', 10, true),
    ('Laguna Escondida de Alta Montaña', 'serrania', 'serrania-perija-laguna', 'Espejo de agua cristalina en las alturas de la Serranía del Perijá', 11, true),
    ('Páramo y Frailejones', 'serrania', 'serrania-perija-frailejones', 'Vegetación endémica de frailejones en el ecosistema de páramo', 12, true),
    ('Cordillera Majestuosa de Perijá', 'serrania', 'serrania-perija-cordillera', 'Vistas panorámicas del macizo montañoso de la Serranía del Perijá', 13, true),
    ('Pozo de Agua Cristalina', 'serrania', 'serrania-pozo-cristalino', 'Piscina natural de vertiente andina rodeada de vegetación', 14, true),
    ('Mirador Los Pinos', 'serrania', 'serrania-los-pinos', 'Senderos bajo bosque de pinos con vista a las nubes', 15, true),
    ('Sabana Rubia y Frontera', 'serrania', 'serrania-sabana-rubia', 'Planicie de alta montaña en Sabana Rubia, páramo del Perijá', 16, true),
    ('La Casa de las Arepas', 'gastronomia', 'gastronomia-casa-arepas', 'Degustación de arepa rellena artesanal y gastronomía local tradicional', 17, true),
    ('Fogata en la Casa de Vidrio', 'fogata', 'fogata-casa-de-vidrio', 'Fogata cálida al caer la tarde en la terraza mirador de la Casa de Vidrio', 18, true)
ON CONFLICT DO NOTHING;
