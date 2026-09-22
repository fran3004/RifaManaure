import { supabase } from '@/lib/supabase';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import type {
  PrizeSettingsRow,
  PrizeSettingsUpdate,
  PrizeExperienceRow,
  PrizeExperienceInsert,
  PrizeExperienceUpdate,
  PublicPrizeData,
  OfficialTourFeature,
} from '@/types/raffle.types';

export const PRIZE_CACHE_KEY = 'manaure_prize_details_cache';

export const DEFAULT_OFFICIAL_TOUR_FEATURES: OfficialTourFeature[] = [
  {
    title: 'Viaje ida y vuelta pago:',
    description: 'desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)',
  },
  {
    title: 'Hospedaje:',
    description: 'en uno de los mejores hoteles / glamping campestre',
  },
  {
    title: 'Noche romántica:',
    description: 'velada íntima preparada especialmente para la pareja',
  },
  {
    title: 'Alimentación completa:',
    description: 'desayunos, almuerzos campestres y cenas típicas',
  },
  {
    title: 'Experiencia de cuatrimoto:',
    description: 'ruta guiada por trochas y miradores',
  },
  {
    title: 'Experiencia del parapente:',
    description: 'vuelo libre tándem con piloto certificado',
  },
  {
    title: 'Ruta Casa de Vidrio:',
    description: 'Serranía de Perijá con fogata nocturna',
  },
  {
    title: 'Registro fotográfico:',
    description: 'cobertura profesional en alta definición',
  },
];

export const DEFAULT_PRIZE_SETTINGS: PrizeSettingsRow = {
  id: 'main',
  badge_text: 'Paquete Todo Incluido para 2 Personas',
  title: '¿Qué incluye el Premio Mayor?',
  subtitle:
    'Una vivencia integral que reúne la mejor hotelería campestre, aventura extrema y la riqueza cultural y gastronómica de Manaure.',
  official_tour_badge: 'PREMIO MAYOR OFICIAL',
  official_tour_title: 'Tour Vive Manaure • 3 Días y 2 Noches',
  official_tour_subtitle:
    'Todo incluido para la pareja (2 personas). Especificación detallada del premio:',
  official_tour_features: DEFAULT_OFFICIAL_TOUR_FEATURES,
  updated_at: new Date().toISOString(),
};

export const DEFAULT_PRIZE_EXPERIENCES: PrizeExperienceRow[] = [
  {
    id: 'exp-cuatrimotos',
    title: 'Tour en Cuatrimoto por Trochas',
    partner_name: 'Cuatri Tours Manaure',
    description:
      'Recorrido guiado en cuatrimotos todoterreno por caminos veredales y miradores panorámicos de la Serranía.',
    features: [
      'Equipamiento de seguridad incluido',
      'Guía turístico certificado',
      'Paradas en miradores fotográficos',
    ],
    image_url: null,
    image_slug: 'cuatrimoto-aventura-cordillera',
    icon: 'Sparkles',
    display_order: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-glamping',
    title: 'Noche de Glamping & Fogata',
    partner_name: 'Mashiramo Glamping / Villa Adelaida',
    description:
      'Alojamiento exclusivo bajo las estrellas con fogata privada en mirador y desayuno campestre.',
    features: [
      'Cama King-size & Jacuzzi',
      'Fogata con malvaviscos y vino',
      'Vista panorámica nocturna',
    ],
    image_url: null,
    image_slug: 'fogata-casa-de-vidrio',
    icon: 'Flame',
    display_order: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-parapente',
    title: 'Vuelo en Parapente Tándem',
    partner_name: 'Manaure Aventura',
    description:
      'Experiencia inolvidable de vuelo libre sobre el valle de Manaure con piloto profesional certificado.',
    features: [
      'Pilotos con licencia FAI/Aeroclub',
      'Grabación de video en vuelo',
      'Charla técnica y seguros',
    ],
    image_url: null,
    image_slug: 'parapente-bandera',
    icon: 'Wind',
    display_order: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-paramo',
    title: 'Expedición a la Serranía del Perijá',
    partner_name: 'Los Pinos Manaure & Metallura',
    description: 'Caminata ecológica por el ecosistema de frailejones y lagunas de alta montaña.',
    features: [
      'Avistamiento de aves endémicas',
      'Interpretación ambiental',
      'Refrigerio de montaña',
    ],
    image_url: null,
    image_slug: 'serrania-perija-laguna',
    icon: 'Mountain',
    display_order: 4,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-gastronomia',
    title: 'Tour Gastronómico Local',
    partner_name: 'La Casa de las Arepas & Absolom',
    description:
      'Degustación de arepas típicas rellenas, dulces tradicionales de mora y café de altura cosechado en Perijá.',
    features: [
      'Almuerzo típico completo',
      'Degustación de postres de mora',
      'Café especial de origen',
    ],
    image_url: null,
    image_slug: 'gastronomia-casa-arepas',
    icon: 'Utensils',
    display_order: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-fotografia',
    title: 'Registro Fotográfico Pro',
    partner_name: 'PHOTours',
    description:
      'Acompañamiento audiovisual durante las actividades para que te lleves recuerdos inolvidables en alta resolución.',
    features: [
      'Galería digital entregada en 48h',
      'Edición profesional de color',
      'Reel editado para redes sociales',
    ],
    image_url: null,
    image_slug: 'cuatrimoto-mirador',
    icon: 'Camera',
    display_order: 6,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Recupera datos de premio de la caché síncrona de localStorage para evitar parpadeos (FOUC).
 */
export function getCachedPrizeDetails(): PublicPrizeData {
  try {
    const raw = localStorage.getItem(PRIZE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PublicPrizeData;
      if (parsed?.settings && Array.isArray(parsed?.experiences)) {
        return parsed;
      }
    }
  } catch {
    // Si localStorage no está disponible o falla el parseo, se recurre a los defaults
  }

  return {
    settings: DEFAULT_PRIZE_SETTINGS,
    experiences: DEFAULT_PRIZE_EXPERIENCES,
  };
}

/**
 * Guarda los datos de premio en caché local.
 */
function setCachedPrizeDetails(data: PublicPrizeData): void {
  try {
    localStorage.setItem(PRIZE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignorar si el almacenamiento local está restringido
  }
}

/**
 * Consulta la información del premio para la landing pública con estrategia cache-first.
 */
export async function getPublicPrizeDetails(): Promise<PublicPrizeData> {
  try {
    const [settingsRes, experiencesRes] = await Promise.all([
      supabase.from('prize_settings').select('*').eq('id', 'main').maybeSingle(),
      supabase
        .from('prize_experiences')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    const cached = getCachedPrizeDetails();

    const finalSettings: PrizeSettingsRow = settingsRes.data
      ? {
          ...DEFAULT_PRIZE_SETTINGS,
          ...(settingsRes.data as PrizeSettingsRow),
          official_tour_badge:
            (settingsRes.data as any).official_tour_badge || DEFAULT_PRIZE_SETTINGS.official_tour_badge,
          official_tour_title:
            (settingsRes.data as any).official_tour_title || DEFAULT_PRIZE_SETTINGS.official_tour_title,
          official_tour_subtitle:
            (settingsRes.data as any).official_tour_subtitle ||
            DEFAULT_PRIZE_SETTINGS.official_tour_subtitle,
          official_tour_features:
            (settingsRes.data as any).official_tour_features &&
            Array.isArray((settingsRes.data as any).official_tour_features) &&
            ((settingsRes.data as any).official_tour_features as any[]).length > 0
              ? (settingsRes.data as any).official_tour_features
              : DEFAULT_PRIZE_SETTINGS.official_tour_features,
        }
      : cached.settings;

    const finalExperiences: PrizeExperienceRow[] =
      experiencesRes.data && experiencesRes.data.length > 0
        ? (experiencesRes.data as PrizeExperienceRow[])
        : cached.experiences;

    const result: PublicPrizeData = {
      settings: finalSettings,
      experiences: finalExperiences,
    };

    setCachedPrizeDetails(result);
    return result;
  } catch (err) {
    console.warn('[prizeService] Usando caché local para información del premio:', err);
    return getCachedPrizeDetails();
  }
}

/**
 * Obtiene la información completa (incluyendo experiencias inactivas) para el módulo administrativo.
 */
export async function getAdminPrizeDetails(): Promise<{
  settings: PrizeSettingsRow;
  experiences: PrizeExperienceRow[];
}> {
  try {
    const [settingsRes, experiencesRes] = await Promise.all([
      supabase.from('prize_settings').select('*').eq('id', 'main').maybeSingle(),
      supabase
        .from('prize_experiences')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    let settings = settingsRes.data as PrizeSettingsRow | null;
    if (!settings) {
      // Si la tabla no tiene registro todavía, crearlo o devolver el por defecto
      settings = DEFAULT_PRIZE_SETTINGS;
    } else {
      settings = {
        ...DEFAULT_PRIZE_SETTINGS,
        ...settings,
        official_tour_badge:
          (settings as any).official_tour_badge || DEFAULT_PRIZE_SETTINGS.official_tour_badge,
        official_tour_title:
          (settings as any).official_tour_title || DEFAULT_PRIZE_SETTINGS.official_tour_title,
        official_tour_subtitle:
          (settings as any).official_tour_subtitle || DEFAULT_PRIZE_SETTINGS.official_tour_subtitle,
        official_tour_features:
          (settings as any).official_tour_features &&
          Array.isArray((settings as any).official_tour_features) &&
          ((settings as any).official_tour_features as any[]).length > 0
            ? (settings as any).official_tour_features
            : DEFAULT_PRIZE_SETTINGS.official_tour_features,
      };
    }

    const experiences = (experiencesRes.data || []) as PrizeExperienceRow[];

    return {
      settings,
      experiences: experiences.length > 0 ? experiences : DEFAULT_PRIZE_EXPERIENCES,
    };
  } catch (err) {
    console.error('[prizeService] Error al cargar datos para el admin:', err);
    return {
      settings: DEFAULT_PRIZE_SETTINGS,
      experiences: DEFAULT_PRIZE_EXPERIENCES,
    };
  }
}

/**
 * Actualiza los textos de cabecera de la sección del premio o del Tour Oficial.
 */
export async function updatePrizeSettings(
  updates: Partial<PrizeSettingsUpdate>
): Promise<{ success: boolean; data?: PrizeSettingsRow; error?: string }> {
  try {
    const payload: Record<string, any> = {
      id: 'main',
      updated_at: new Date().toISOString(),
    };

    if (updates.badge_text !== undefined) payload.badge_text = updates.badge_text.trim();
    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.subtitle !== undefined) payload.subtitle = updates.subtitle.trim();
    if (updates.official_tour_badge !== undefined) {
      payload.official_tour_badge = updates.official_tour_badge.trim();
    }
    if (updates.official_tour_title !== undefined) {
      payload.official_tour_title = updates.official_tour_title.trim();
    }
    if (updates.official_tour_subtitle !== undefined) {
      payload.official_tour_subtitle = updates.official_tour_subtitle.trim();
    }
    if (updates.official_tour_features !== undefined) {
      payload.official_tour_features = updates.official_tour_features;
    }

    const { data, error } = await supabase
      .from('prize_settings')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const mergedData: PrizeSettingsRow = {
      ...DEFAULT_PRIZE_SETTINGS,
      ...(data as PrizeSettingsRow),
    };

    // Actualizar caché
    const currentCache = getCachedPrizeDetails();
    setCachedPrizeDetails({
      ...currentCache,
      settings: mergedData,
    });

    return { success: true, data: mergedData };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al guardar textos del premio.',
    };
  }
}

/**
 * Crea una nueva experiencia / tarjeta de premio.
 */
export async function createPrizeExperience(
  payload: PrizeExperienceInsert
): Promise<{ success: boolean; data?: PrizeExperienceRow; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('prize_experiences')
      .insert({
        title: payload.title.trim(),
        partner_name: payload.partner_name.trim(),
        description: payload.description.trim(),
        features: payload.features || [],
        image_url: payload.image_url ? payload.image_url.trim() : null,
        image_slug: payload.image_slug ? payload.image_slug.trim() : 'cuatrimoto-flota',
        icon: payload.icon ? payload.icon.trim() : 'Sparkles',
        display_order: payload.display_order ?? 0,
        is_active: payload.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PrizeExperienceRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear experiencia.',
    };
  }
}

/**
 * Actualiza una experiencia de premio existente.
 */
export async function updatePrizeExperience(
  id: string,
  updates: PrizeExperienceUpdate
): Promise<{ success: boolean; data?: PrizeExperienceRow; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('prize_experiences')
      .update({
        ...updates,
        title: updates.title ? updates.title.trim() : undefined,
        partner_name: updates.partner_name ? updates.partner_name.trim() : undefined,
        description: updates.description ? updates.description.trim() : undefined,
        image_url:
          updates.image_url !== undefined ? updates.image_url?.trim() || null : undefined,
        image_slug: updates.image_slug ? updates.image_slug.trim() : undefined,
        icon: updates.icon ? updates.icon.trim() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PrizeExperienceRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar experiencia.',
    };
  }
}

/**
 * Alterna el estado activo/inactivo de una experiencia.
 */
export async function togglePrizeExperienceActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('prize_experiences')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cambiar estado de la experiencia.',
    };
  }
}

/**
 * Elimina una experiencia de premio.
 */
export async function deletePrizeExperience(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('prize_experiences').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al eliminar la experiencia.',
    };
  }
}

/**
 * Sube una imagen personalizada de experiencia de premio a Cloudinary (carpeta 'manaure-vive/premios').
 */
export async function uploadPrizeImage(
  file: File,
  _prefix = 'premio'
): Promise<{ success: boolean; url?: string; public_id?: string; error?: string }> {
  try {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Formato inválido. Solo se admiten imágenes JPG, PNG o WebP.',
      };
    }

    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        error: 'El archivo supera el tamaño máximo permitido de 5 MB.',
      };
    }

    const uploadRes = await uploadToCloudinary(file, 'manaure-vive/premios', {
      resourceType: 'image',
    });

    if (!uploadRes.success || !uploadRes.secure_url) {
      return {
        success: false,
        error: uploadRes.error || 'No fue posible subir la imagen del premio a Cloudinary.',
      };
    }

    return {
      success: true,
      url: uploadRes.secure_url,
      public_id: uploadRes.public_id,
    };
  } catch (err) {
    console.error('[prizeService] Error inesperado en uploadPrizeImage:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al subir la imagen del premio.',
    };
  }
}

