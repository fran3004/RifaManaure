-- ============================================================================
-- MIGRACIÓN 060: GESTIÓN INTEGRAL DEL CARRUSEL DE FONDOS DEL HERO (hero_slides)
-- ============================================================================
-- 1. Tabla hero_slides para los fondos dinámicos del inicio (pantalla principal)
-- 2. Índices de rendimiento (display_order, is_active)
-- 3. Trigger automático para updated_at
-- 4. Políticas de Seguridad RLS (Lectura pública y gestión por administradores)
-- 5. Semilla inicial con las 4 diapositivas canónicas del carrusel del Hero
-- ============================================================================

-- 1. Tabla de diapositivas de fondo del Hero
CREATE TABLE IF NOT EXISTS public.hero_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,                             -- Texto que acompaña la experiencia en el chip flotante
    image_url TEXT NOT NULL,                         -- URL pública optimizada en Cloudinary
    image_slug TEXT,                                 -- Slug referencial si proviene del catálogo de Manaure
    alt_text TEXT NOT NULL DEFAULT '',               -- Texto descriptivo para accesibilidad y SEO
    display_order INT NOT NULL DEFAULT 0,            -- Orden de rotación (1, 2, 3...)
    is_active BOOLEAN NOT NULL DEFAULT true,         -- Si participa en la rotación activa del Hero
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS hero_slides_display_order_idx ON public.hero_slides (display_order ASC);
CREATE INDEX IF NOT EXISTS hero_slides_is_active_idx ON public.hero_slides (is_active);

-- 3. Trigger para actualización automática de updated_at
DROP TRIGGER IF EXISTS trg_hero_slides_updated_at ON public.hero_slides;
CREATE TRIGGER trg_hero_slides_updated_at
    BEFORE UPDATE ON public.hero_slides
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

-- 4. Políticas Row Level Security (RLS)
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

-- 4.1 Lectura pública de diapositivas activas (o todas si es administrador autenticado)
DROP POLICY IF EXISTS "hero_slides_public_read" ON public.hero_slides;
CREATE POLICY "hero_slides_public_read" ON public.hero_slides
    FOR SELECT
    USING (
        is_active = true
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

-- 4.2 Mutación exclusiva para administradores
DROP POLICY IF EXISTS "hero_slides_admin_manage" ON public.hero_slides;
CREATE POLICY "hero_slides_admin_manage" ON public.hero_slides
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 5. Semilla inicial con las 4 fotografías estelares aprobadas del Hero
INSERT INTO public.hero_slides (title, image_url, image_slug, alt_text, display_order, is_active)
VALUES
    (
        'Serranía del Perijá',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790100541/manaure-vive/galeria/serrania/og-image.jpg',
        'og-image',
        'Majestuoso cañón montañoso y cordillera de la Serranía del Perijá bajo cielo azul despejado',
        1,
        true
    ),
    (
        'Aventura en Cuatrimoto',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099166/manaure-vive/galeria/cuatrimoto/cuatrimoto-aventura-cordillera.jpg',
        'cuatrimoto-aventura-cordillera',
        'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá',
        2,
        true
    ),
    (
        'Laguna Natural en Perijá',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099169/manaure-vive/galeria/serrania/serrania-perija-laguna.jpg',
        'serrania-perija-laguna',
        'Laguna de alta montaña reflejando el cielo andino y la vegetación de páramo',
        3,
        true
    ),
    (
        'Fogata en la Casa de Vidrio',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099173/manaure-vive/galeria/fogata/fogata-casa-de-vidrio.jpg',
        'fogata-casa-de-vidrio',
        'Fogata al atardecer en la terraza panorámica de la Casa de Vidrio',
        4,
        true
    )
ON CONFLICT DO NOTHING;
