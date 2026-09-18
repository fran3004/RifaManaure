-- ============================================================================
-- MIGRACIÓN 031: GESTIÓN INTEGRAL DEL PREMIO MAYOR (prize_settings & prize_experiences)
-- ============================================================================
-- 1. Tabla prize_settings para textos globales de cabecera del premio
-- 2. Tabla prize_experiences para las tarjetas de experiencias y actividades
-- 3. Triggers automáticos para updated_at
-- 4. Políticas de Seguridad RLS (Lectura pública y Mutación exclusiva de administradores)
-- 5. Bucket de Supabase Storage 'prize-images' y políticas de acceso
-- 6. Semilla con los datos iniciales predeterminados de DetallePremio
-- ============================================================================

-- 1. Tabla de configuración de cabecera de la sección del premio
CREATE TABLE IF NOT EXISTS public.prize_settings (
    id TEXT PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
    badge_text TEXT NOT NULL DEFAULT 'Paquete Todo Incluido para 2 Personas',
    title TEXT NOT NULL DEFAULT '¿Qué incluye el Premio Mayor?',
    subtitle TEXT NOT NULL DEFAULT 'Una vivencia integral que reúne la mejor hotelería campestre, aventura extrema y la riqueza cultural y gastronómica de Manaure.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de experiencias / actividades que conforman el premio
CREATE TABLE IF NOT EXISTS public.prize_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    partner_name TEXT NOT NULL,
    description TEXT NOT NULL,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    image_url TEXT,
    image_slug VARCHAR(100) DEFAULT 'cuatrimoto-flota',
    icon VARCHAR(50) NOT NULL DEFAULT 'Sparkles',
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trigger para actualización automática de updated_at
CREATE OR REPLACE FUNCTION public.fn_prize_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prize_settings_updated_at ON public.prize_settings;
CREATE TRIGGER trg_prize_settings_updated_at
    BEFORE UPDATE ON public.prize_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

DROP TRIGGER IF EXISTS trg_prize_experiences_updated_at ON public.prize_experiences;
CREATE TRIGGER trg_prize_experiences_updated_at
    BEFORE UPDATE ON public.prize_experiences
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prize_updated_at();

-- 4. Configurar Row Level Security (RLS)
ALTER TABLE public.prize_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_experiences ENABLE ROW LEVEL SECURITY;

-- 4.1 Políticas RLS para prize_settings
DROP POLICY IF EXISTS "Lectura pública de prize_settings" ON public.prize_settings;
CREATE POLICY "Lectura pública de prize_settings" ON public.prize_settings
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Administradores gestionan prize_settings" ON public.prize_settings;
CREATE POLICY "Administradores gestionan prize_settings" ON public.prize_settings
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 4.2 Políticas RLS para prize_experiences
DROP POLICY IF EXISTS "Lectura pública de experiencias activas" ON public.prize_experiences;
CREATE POLICY "Lectura pública de experiencias activas" ON public.prize_experiences
    FOR SELECT
    USING (
        is_active = true 
        OR (auth.role() = 'authenticated' AND public.is_admin(auth.uid()))
    );

DROP POLICY IF EXISTS "Administradores gestionan prize_experiences" ON public.prize_experiences;
CREATE POLICY "Administradores gestionan prize_experiences" ON public.prize_experiences
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- 5. Bucket de Supabase Storage para imágenes personalizadas de premios
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'prize-images',
    'prize-images',
    true,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- Políticas de Storage para 'prize-images'
DROP POLICY IF EXISTS "Lectura pública de imágenes de premios" ON storage.objects;
CREATE POLICY "Lectura pública de imágenes de premios" ON storage.objects
    FOR SELECT USING (bucket_id = 'prize-images');

DROP POLICY IF EXISTS "Solo administradores suben imágenes de premios" ON storage.objects;
CREATE POLICY "Solo administradores suben imágenes de premios" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'prize-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores actualizan imágenes de premios" ON storage.objects;
CREATE POLICY "Solo administradores actualizan imágenes de premios" ON storage.objects
    FOR UPDATE USING (bucket_id = 'prize-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Solo administradores eliminan imágenes de premios" ON storage.objects;
CREATE POLICY "Solo administradores eliminan imágenes de premios" ON storage.objects
    FOR DELETE USING (bucket_id = 'prize-images' AND public.is_admin(auth.uid()));

-- 6. Semilla inicial de datos para prize_settings y prize_experiences
INSERT INTO public.prize_settings (id, badge_text, title, subtitle)
VALUES (
    'main',
    'Paquete Todo Incluido para 2 Personas',
    '¿Qué incluye el Premio Mayor?',
    'Una vivencia integral que reúne la mejor hotelería campestre, aventura extrema y la riqueza cultural y gastronómica de Manaure.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prize_experiences (
    title,
    partner_name,
    description,
    features,
    image_slug,
    icon,
    display_order,
    is_active
)
VALUES
    (
        'Tour en Cuatrimoto por Trochas',
        'Cuatri Tours Manaure',
        'Recorrido guiado en cuatrimotos todoterreno por caminos veredales y miradores panorámicos de la Serranía.',
        '["Equipamiento de seguridad incluido", "Guía turístico certificado", "Paradas en miradores fotográficos"]'::jsonb,
        'cuatrimoto-flota',
        'Sparkles',
        1,
        true
    ),
    (
        'Noche de Glamping & Fogata',
        'Mashiramo Glamping / Villa Adelaida',
        'Alojamiento exclusivo bajo las estrellas con fogata privada en mirador y desayuno campestre.',
        '["Cama King-size & Jacuzzi", "Fogata con malvaviscos y vino", "Vista panorámica nocturna"]'::jsonb,
        'fogata-casa-de-vidrio',
        'Flame',
        2,
        true
    ),
    (
        'Vuelo en Parapente Tándem',
        'Manaure Aventura',
        'Experiencia inolvidable de vuelo libre sobre el valle de Manaure con piloto profesional certificado.',
        '["Pilotos con licencia FAI/Aeroclub", "Grabación de video en vuelo", "Charla técnica y seguros"]'::jsonb,
        'parapente-bandera',
        'Wind',
        3,
        true
    ),
    (
        'Expedición a la Serranía del Perijá',
        'Los Pinos Manaure & Metallura',
        'Caminata ecológica por el ecosistema de frailejones y lagunas de alta montaña.',
        '["Avistamiento de aves endémicas", "Interpretación ambiental", "Refrigerio de montaña"]'::jsonb,
        'serrania-perija-laguna',
        'Mountain',
        4,
        true
    ),
    (
        'Tour Gastronómico Local',
        'La Casa de las Arepas & Absolom',
        'Degustación de arepas típicas rellenas, dulces tradicionales de mora y café de altura cosechado en Perijá.',
        '["Almuerzo típico completo", "Degustación de postres de mora", "Café especial de origen"]'::jsonb,
        'serrania-perija-panoramica',
        'Utensils',
        5,
        true
    ),
    (
        'Registro Fotográfico Pro',
        'PHOTours',
        'Acompañamiento audiovisual durante las actividades para que te lleves recuerdos inolvidables en alta resolución.',
        '["Galería digital entregada en 48h", "Edición profesional de color", "Reel editado para redes sociales"]'::jsonb,
        'cuatrimoto-mirador',
        'Camera',
        6,
        true
    );

