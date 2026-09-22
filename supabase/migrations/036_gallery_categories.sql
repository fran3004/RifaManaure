-- ============================================================================
-- MIGRACIÓN 036: GESTIÓN DINÁMICA DE CATEGORÍAS DE GALERÍA (gallery_categories)
-- ============================================================================
-- 1. Tabla gallery_categories para categorías dinámicas de la galería fotográfica
-- 2. Índices de rendimiento (display_order, slug, is_active)
-- 3. Triggers automáticos para updated_at
-- 4. Políticas de Seguridad RLS (Lectura pública y gestión por administradores)
-- 5. Semilla con las categorías iniciales del catálogo oficial de Manaure
-- ============================================================================

-- 1. Tabla de categorías de la galería
CREATE TABLE IF NOT EXISTS public.gallery_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS gallery_categories_order_idx ON public.gallery_categories (display_order ASC);
CREATE INDEX IF NOT EXISTS gallery_categories_slug_idx ON public.gallery_categories (slug);
CREATE INDEX IF NOT EXISTS gallery_categories_is_active_idx ON public.gallery_categories (is_active);

-- 3. Trigger para actualización automática de updated_at
DROP TRIGGER IF EXISTS trg_gallery_categories_updated_at ON public.gallery_categories;
CREATE TRIGGER trg_gallery_categories_updated_at
    BEFORE UPDATE ON public.gallery_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

-- 4. Políticas Row Level Security (RLS)
ALTER TABLE public.gallery_categories ENABLE ROW LEVEL SECURITY;

-- 4.1 Lectura pública de categorías activas (o todas si es administrador autenticado)
DROP POLICY IF EXISTS "gallery_categories_public_read" ON public.gallery_categories;
CREATE POLICY "gallery_categories_public_read" ON public.gallery_categories
    FOR SELECT
    USING (
        is_active = true
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

-- 4.2 Mutación exclusiva para administradores autenticados
DROP POLICY IF EXISTS "gallery_categories_admin_manage" ON public.gallery_categories;
CREATE POLICY "gallery_categories_admin_manage" ON public.gallery_categories
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 5. Semilla con las categorías base del ecosistema turístico de Manaure
INSERT INTO public.gallery_categories (slug, name, display_order, is_active)
VALUES
    ('cuatrimoto', 'Cuatrimotos', 1, true),
    ('parapente', 'Parapente', 2, true),
    ('serrania', 'Serranía del Perijá', 3, true),
    ('hospedaje', 'Hospedaje & Glamping', 4, true),
    ('gastronomia', 'Gastronomía', 5, true),
    ('fogata', 'Noche & Fogata', 6, true),
    ('otro', 'Otra Experiencia', 7, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

