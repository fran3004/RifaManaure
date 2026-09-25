import { supabase } from '@/lib/supabase';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractCloudinaryPublicId,
} from '@/services/cloudinaryService';
import type {
  HeroSlideRow,
  HeroSlideInsert,
  HeroSlideUpdate,
  HeroSlideCachePayload,
} from '@/types/raffle.types';

export const HERO_SLIDES_CACHE_KEY = 'manaure_hero_slides_cache_v1';
export const HERO_SLIDES_CACHE_VERSION = 1;
export const HERO_SLIDES_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutos

/**
 * 4 Diapositivas estelares canónicas de respaldo ante fallos de conectividad.
 */
export const FALLBACK_HERO_SLIDES: HeroSlideRow[] = [
  {
    id: 'fallback-hero-1',
    title: 'Serranía del Perijá',
    image_url:
      'https://res.cloudinary.com/ky01b0vz/image/upload/v1790100541/manaure-vive/galeria/serrania/og-image.jpg',
    image_slug: 'og-image',
    alt_text:
      'Majestuoso cañón montañoso y cordillera de la Serranía del Perijá bajo cielo azul despejado',
    display_order: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'fallback-hero-2',
    title: 'Aventura en Cuatrimoto',
    image_url:
      'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099166/manaure-vive/galeria/cuatrimoto/cuatrimoto-aventura-cordillera.jpg',
    image_slug: 'cuatrimoto-aventura-cordillera',
    alt_text:
      'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá',
    display_order: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'fallback-hero-3',
    title: 'Laguna Natural en Perijá',
    image_url:
      'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099169/manaure-vive/galeria/serrania/serrania-perija-laguna.jpg',
    image_slug: 'serrania-perija-laguna',
    alt_text:
      'Laguna de alta montaña reflejando el cielo andino y la vegetación de páramo',
    display_order: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'fallback-hero-4',
    title: 'Fogata en la Casa de Vidrio',
    image_url:
      'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099173/manaure-vive/galeria/fogata/fogata-casa-de-vidrio.jpg',
    image_slug: 'fogata-casa-de-vidrio',
    alt_text:
      'Fogata al atardecer en la terraza panorámica de la Casa de Vidrio',
    display_order: 4,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// --- Gestión de Caché Local ---

export function getCachedHeroSlides(): HeroSlideRow[] | null {
  try {
    const raw = localStorage.getItem(HERO_SLIDES_CACHE_KEY);
    if (!raw) return null;
    const payload: HeroSlideCachePayload = JSON.parse(raw);
    if (payload.version !== HERO_SLIDES_CACHE_VERSION) {
      localStorage.removeItem(HERO_SLIDES_CACHE_KEY);
      return null;
    }
    const isExpired = Date.now() - payload.timestamp > HERO_SLIDES_CACHE_TTL_MS;
    if (isExpired) {
      return null;
    }
    return payload.data;
  } catch {
    return null;
  }
}

export function setCachedHeroSlides(slides: HeroSlideRow[]): void {
  try {
    const payload: HeroSlideCachePayload = {
      version: HERO_SLIDES_CACHE_VERSION,
      timestamp: Date.now(),
      data: slides,
    };
    localStorage.setItem(HERO_SLIDES_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Silencioso ante errores de quota en localStorage
  }
}

export function clearHeroSlidesCache(): void {
  try {
    localStorage.removeItem(HERO_SLIDES_CACHE_KEY);
  } catch {
    // Silencioso
  }
}

// --- Consultas Públicas ---

/**
 * Obtiene las diapositivas de fondo del Hero activas y ordenadas.
 * Cuenta con resiliencia total: primero lee caché fresco, luego consulta Supabase,
 * y en caso de error o ausencia de red, retorna la caché o el catálogo estelar canónico.
 */
export async function getPublicHeroSlides(): Promise<HeroSlideRow[]> {
  try {
    const cached = getCachedHeroSlides();
    if (cached && cached.length > 0) {
      // Revalidación silenciosa en segundo plano
      revalidatePublicHeroSlides().catch(() => {});
      return cached;
    }

    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) {
      if (error) {
        console.warn('[heroSlideService] Usando diapositivas de respaldo por error en Supabase:', error.message);
      }
      return cached && cached.length > 0 ? cached : FALLBACK_HERO_SLIDES;
    }

    setCachedHeroSlides(data);
    return data;
  } catch (err) {
    console.error('[heroSlideService] Excepción al obtener diapositivas del Hero:', err);
    const cached = getCachedHeroSlides();
    return cached && cached.length > 0 ? cached : FALLBACK_HERO_SLIDES;
  }
}

async function revalidatePublicHeroSlides(): Promise<void> {
  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (!error && data && data.length > 0) {
    setCachedHeroSlides(data);
  }
}

// --- Consultas y Mutaciones Administrativas ---

export async function getAdminHeroSlides(): Promise<{
  success: boolean;
  data?: HeroSlideRow[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al cargar diapositivas del Hero.';
    return { success: false, error: msg };
  }
}

export async function createHeroSlide(payload: HeroSlideInsert): Promise<{
  success: boolean;
  data?: HeroSlideRow;
  error?: string;
}> {
  try {
    if (!payload.title || !payload.title.trim()) {
      return { success: false, error: 'El título de la experiencia es requerido.' };
    }
    if (!payload.image_url || !payload.image_url.trim()) {
      return { success: false, error: 'La fotografía de fondo es requerida.' };
    }

    const { data, error } = await supabase
      .from('hero_slides')
      .insert({
        title: payload.title.trim(),
        image_url: payload.image_url.trim(),
        image_slug: payload.image_slug?.trim() || null,
        alt_text: payload.alt_text?.trim() || payload.title.trim(),
        display_order: payload.display_order ?? 0,
        is_active: payload.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    clearHeroSlidesCache();
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al crear la diapositiva.';
    return { success: false, error: msg };
  }
}

export async function updateHeroSlide(
  id: string,
  updates: HeroSlideUpdate
): Promise<{
  success: boolean;
  data?: HeroSlideRow;
  error?: string;
}> {
  try {
    if (!id) return { success: false, error: 'ID de diapositiva no suministrado.' };

    const updatePayload: HeroSlideUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updatePayload.title !== undefined) {
      updatePayload.title = updatePayload.title.trim();
    }
    if (updatePayload.alt_text !== undefined) {
      updatePayload.alt_text = updatePayload.alt_text.trim();
    }

    const { data, error } = await supabase
      .from('hero_slides')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    clearHeroSlidesCache();
    return { success: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al actualizar la diapositiva.';
    return { success: false, error: msg };
  }
}

export async function deleteHeroSlide(
  id: string,
  imageUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) return { success: false, error: 'ID de diapositiva no suministrado.' };

    // Si la imagen pertenece a la carpeta 'manaure-vive/galeria/hero', se elimina de Cloudinary
    if (imageUrl && imageUrl.includes('res.cloudinary.com')) {
      const publicId = extractCloudinaryPublicId(imageUrl);
      if (publicId && publicId.startsWith('manaure-vive/galeria/hero')) {
        try {
          await deleteFromCloudinary(publicId);
        } catch (cloudErr) {
          console.warn('[heroSlideService] Aviso al eliminar recurso en Cloudinary:', cloudErr);
        }
      }
    }

    const { error } = await supabase.from('hero_slides').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    clearHeroSlidesCache();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar la diapositiva.';
    return { success: false, error: msg };
  }
}

export async function toggleHeroSlideActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateHeroSlide(id, { is_active: isActive });
}

export async function reorderHeroSlides(
  orderItems: Array<{ id: string; display_order: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!orderItems || orderItems.length === 0) return { success: true };

    const updates = orderItems.map((item) =>
      supabase
        .from('hero_slides')
        .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
        .eq('id', item.id)
    );

    const results = await Promise.all(updates);
    const failure = results.find((r) => r.error);

    if (failure?.error) {
      return { success: false, error: failure.error.message };
    }

    clearHeroSlidesCache();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al reordenar las diapositivas del Hero.';
    return { success: false, error: msg };
  }
}

/**
 * Sube una nueva fotografía para el carrusel de fondo del Hero directamente a Cloudinary.
 * Destino: 'manaure-vive/galeria/hero'
 */
export async function uploadHeroPhoto(file: File): Promise<{
  success: boolean;
  secure_url?: string;
  public_id?: string;
  error?: string;
}> {
  try {
    if (!file) {
      return { success: false, error: 'No se seleccionó ningún archivo.' };
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Formato no compatible. Por favor sube una imagen JPG, PNG o WebP.',
      };
    }

    // Límite de 10 MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: 'El archivo excede el tamaño máximo permitido de 10 MB.',
      };
    }

    const folder = 'manaure-vive/galeria/hero';
    const result = await uploadToCloudinary(file, folder);

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al subir la fotografía a Cloudinary.';
    return { success: false, error: msg };
  }
}
