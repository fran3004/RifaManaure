-- ============================================================================
-- MIGRACIÓN 033: PREMIO MAYOR OFICIAL (BANNER VERDE) Y SINCRONIZACIÓN DE IMÁGENES
-- ============================================================================
-- 1. Ampliar prize_settings con campos para el Banner Verde Oficial
--    - official_tour_badge: 'PREMIO MAYOR OFICIAL'
--    - official_tour_title: 'Tour Vive Manaure • 3 Días y 2 Noches'
--    - official_tour_subtitle: 'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'
--    - official_tour_features: JSONB con las 8 especificaciones detalladas
-- 2. Actualizar registro 'main' con los valores predeterminados completos
-- 3. Corregir slug de imagen de 'Tour Gastronómico Local' a 'gastronomia-casa-arepas'
-- ============================================================================

-- 1. Ampliar tabla prize_settings
ALTER TABLE public.prize_settings
    ADD COLUMN IF NOT EXISTS official_tour_badge TEXT NOT NULL DEFAULT 'PREMIO MAYOR OFICIAL',
    ADD COLUMN IF NOT EXISTS official_tour_title TEXT NOT NULL DEFAULT 'Tour Vive Manaure • 3 Días y 2 Noches',
    ADD COLUMN IF NOT EXISTS official_tour_subtitle TEXT NOT NULL DEFAULT 'Todo incluido para la pareja (2 personas). Especificación detallada del premio:',
    ADD COLUMN IF NOT EXISTS official_tour_features JSONB NOT NULL DEFAULT '[
        {"title": "Viaje ida y vuelta pago:", "description": "desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)"},
        {"title": "Hospedaje:", "description": "en uno de los mejores hoteles / glamping campestre"},
        {"title": "Noche romántica:", "description": "velada íntima preparada especialmente para la pareja"},
        {"title": "Alimentación completa:", "description": "desayunos, almuerzos campestres y cenas típicas"},
        {"title": "Experiencia de cuatrimoto:", "description": "ruta guiada por trochas y miradores"},
        {"title": "Experiencia del parapente:", "description": "vuelo libre tándem con piloto certificado"},
        {"title": "Ruta Casa de Vidrio:", "description": "Serranía de Perijá con fogata nocturna"},
        {"title": "Registro fotográfico:", "description": "cobertura profesional en alta definición"}
    ]'::jsonb;

-- 2. Asegurar que el registro 'main' contenga los datos oficiales actualizados
UPDATE public.prize_settings
SET
    official_tour_badge = COALESCE(NULLIF(official_tour_badge, ''), 'PREMIO MAYOR OFICIAL'),
    official_tour_title = COALESCE(NULLIF(official_tour_title, ''), 'Tour Vive Manaure • 3 Días y 2 Noches'),
    official_tour_subtitle = COALESCE(NULLIF(official_tour_subtitle, ''), 'Todo incluido para la pareja (2 personas). Especificación detallada del premio:'),
    official_tour_features = CASE 
        WHEN official_tour_features IS NULL OR jsonb_array_length(official_tour_features) = 0 THEN '[
            {"title": "Viaje ida y vuelta pago:", "description": "desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)"},
            {"title": "Hospedaje:", "description": "en uno de los mejores hoteles / glamping campestre"},
            {"title": "Noche romántica:", "description": "velada íntima preparada especialmente para la pareja"},
            {"title": "Alimentación completa:", "description": "desayunos, almuerzos campestres y cenas típicas"},
            {"title": "Experiencia de cuatrimoto:", "description": "ruta guiada por trochas y miradores"},
            {"title": "Experiencia del parapente:", "description": "vuelo libre tándem con piloto certificado"},
            {"title": "Ruta Casa de Vidrio:", "description": "Serranía de Perijá con fogata nocturna"},
            {"title": "Registro fotográfico:", "description": "cobertura profesional en alta definición"}
        ]'::jsonb
        ELSE official_tour_features
    END,
    updated_at = NOW()
WHERE id = 'main';

-- 3. Sincronizar el slug de imagen de la experiencia gastronómica para que apunte a La Casa de las Arepas
UPDATE public.prize_experiences
SET 
    image_slug = 'gastronomia-casa-arepas',
    updated_at = NOW()
WHERE (title ILIKE '%gastron%mico%' OR partner_name ILIKE '%arepas%')
  AND (image_slug = 'serrania-perija-panoramica' OR image_slug IS NULL OR image_slug = 'cuatrimoto-flota');

