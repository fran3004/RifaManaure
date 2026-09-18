import { supabase } from '@/lib/supabase';
import type {
  PrizeSettingsRow,
  PrizeSettingsUpdate,
  PrizeExperienceRow,
  PrizeExperienceInsert,
  PrizeExperienceUpdate,
  PublicPrizeData,
} from '@/types/raffle.types';

export const PRIZE_CACHE_KEY = 'manaure_prize_details_cache';

export const DEFAULT_PRIZE_SETTINGS: PrizeSettingsRow = {
  id: 'main',
  badge_text: 'Paquete Todo Incluido para 2 Personas',
  title: '¿Qué incluye el Premio Mayor?',
  subtitle:
    'Una vivencia integral que reúne la mejor hotelería campestre, aventura extrema y la riqueza cultural y gastronómica de Manaure.',
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
    image_slug: 'cuatrimoto-flota',
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
    image_slug: 'serrania-perija-panoramica',
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
      ? (settingsRes.data as PrizeSettingsRow)
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
 * Actualiza los textos de cabecera de la sección del premio.
 */
export async function updatePrizeSettings(
  updates: Partial<PrizeSettingsUpdate>
): Promise<{ success: boolean; data?: PrizeSettingsRow; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('prize_settings')
      .upsert({
        id: 'main',
        badge_text: updates.badge_text?.trim() || DEFAULT_PRIZE_SETTINGS.badge_text,
        title: updates.title?.trim() || DEFAULT_PRIZE_SETTINGS.title,
        subtitle: updates.subtitle?.trim() || DEFAULT_PRIZE_SETTINGS.subtitle,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Actualizar caché
    const currentCache = getCachedPrizeDetails();
    setCachedPrizeDetails({
      ...currentCache,
      settings: data as PrizeSettingsRow,
    });

    return { success: true, data: data as PrizeSettingsRow };
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
        image_url: updates.image_url !== undefined ? updates.image_url?.trim() || null : undefined,
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
 * Sube una imagen personalizada al bucket 'prize-images' de Supabase Storage.
 */
export async function uploadPrizeImage(
  file: File,
  prefix = 'premio'
): Promise<{ success: boolean; url?: string; error?: string }> {
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

    const fileExt = file.name.split('.').pop() || 'webp';
    const cleanPrefix = prefix
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    const fileName = `${cleanPrefix}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('prize-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[prizeService] Error en Storage al subir imagen de premio:', uploadError);
      return {
        success: false,
        error: uploadError.message || 'No fue posible subir la imagen.',
      };
    }

    const { data: publicData } = supabase.storage.from('prize-images').getPublicUrl(fileName);

    return {
      success: true,
      url: publicData.publicUrl,
    };
  } catch (err) {
    console.error('[prizeService] Error inesperado en uploadPrizeImage:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al subir la imagen del premio.',
    };
  }
}
