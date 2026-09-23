import { supabase } from '@/lib/supabase';
import type {
  GalleryItemRow,
  GalleryItemInsert,
  GalleryItemUpdate,
  GalleryCachePayload,
  GalleryCategoryItem,
  GalleryCategoryRow,
  GalleryCategoriesCachePayload,
} from '@/types/raffle.types';

export const GALLERY_CACHE_KEY = 'manaure_gallery_cache';
export const GALLERY_CACHE_VERSION = 1;

export const GALLERY_CATEGORIES_CACHE_KEY = 'manaure_gallery_categories_cache';
export const GALLERY_CATEGORIES_CACHE_VERSION = 1;

/**
 * Categorías oficiales canónicas de respaldo para la galería.
 */
export const DEFAULT_GALLERY_CATEGORIES: GalleryCategoryItem[] = [
  { id: 'cat-cuatrimoto', slug: 'cuatrimoto', name: 'Cuatrimotos', display_order: 1, is_active: true, is_default: true },
  { id: 'cat-parapente', slug: 'parapente', name: 'Parapente', display_order: 2, is_active: true, is_default: true },
  { id: 'cat-serrania', slug: 'serrania', name: 'Serranía del Perijá', display_order: 3, is_active: true, is_default: true },
  { id: 'cat-hospedaje', slug: 'hospedaje', name: 'Hospedaje & Glamping', display_order: 4, is_active: true, is_default: true },
  { id: 'cat-gastronomia', slug: 'gastronomia', name: 'Gastronomía', display_order: 5, is_active: true, is_default: true },
  { id: 'cat-fogata', slug: 'fogata', name: 'Noche & Fogata', display_order: 6, is_active: true, is_default: true },
  { id: 'cat-otro', slug: 'otro', name: 'Otra Experiencia', display_order: 7, is_active: true, is_default: true },
];

/**
 * 18 fotografías canónicas de respaldo local para la landing pública
 * en caso de que la tabla aún no esté creada en Supabase o falle la red.
 */
export const FALLBACK_GALLERY_ITEMS: GalleryItemRow[] = [
  {
    id: 'hospedaje-villa-adelaida',
    raffle_id: null,
    title: 'Villa Adelaida Campestre',
    category: 'hospedaje',
    image_slug: 'hospedaje-villa-adelaida',
    image_url: null,
    alt_text: 'Arquitectura campestre y jardines florales en Villa Adelaida',
    display_order: 1,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-topiarios',
    raffle_id: null,
    title: 'Jardines y Topiarios',
    category: 'serrania',
    image_slug: 'serrania-topiarios',
    image_url: null,
    alt_text: 'Esculturas vivas y topiarios decorativos en los jardines de Manaure',
    display_order: 2,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'cuatrimoto-aventura-cordillera',
    raffle_id: null,
    title: 'Aventura en Cuatrimoto por la Cordillera',
    category: 'cuatrimoto',
    image_slug: 'cuatrimoto-aventura-cordillera',
    image_url: null,
    alt_text: 'Caravana de cuatrimotos todoterreno recorriendo la cresta de la Serranía del Perijá',
    display_order: 3,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'cuatrimoto-ruta',
    raffle_id: null,
    title: 'Trochas y Rutas Ecoturísticas',
    category: 'cuatrimoto',
    image_slug: 'cuatrimoto-ruta',
    image_url: null,
    alt_text: 'Recorrido guiado en cuatrimoto a través de caminos de montaña',
    display_order: 4,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'cuatrimoto-mirador',
    raffle_id: null,
    title: 'Mirador Panorámico Cuatrimotos',
    category: 'cuatrimoto',
    image_slug: 'cuatrimoto-mirador',
    image_url: null,
    alt_text: 'Piloto en cuatrimoto contemplando la inmensidad del valle',
    display_order: 5,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'cuatrimoto-cumbre',
    raffle_id: null,
    title: 'Cumbre de la Serranía',
    category: 'cuatrimoto',
    image_slug: 'cuatrimoto-cumbre',
    image_url: null,
    alt_text: 'Llegada a la cima de la montaña con cuatrimotos todoterreno',
    display_order: 6,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'parapente-despegue-atardecer',
    raffle_id: null,
    title: 'Despegue al Atardecer',
    category: 'parapente',
    image_slug: 'parapente-despegue-atardecer',
    image_url: null,
    alt_text: 'Preparación para el vuelo en parapente biplaza durante la puesta de sol',
    display_order: 7,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'parapente-bandera',
    raffle_id: null,
    title: 'Vuelo con Bandera de Manaure',
    category: 'parapente',
    image_slug: 'parapente-bandera',
    image_url: null,
    alt_text: 'Parapentista sobrevolando el cañón portando la bandera representativa',
    display_order: 8,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'parapente-vuelo',
    raffle_id: null,
    title: 'Vuelo Libre sobre el Cañón',
    category: 'parapente',
    image_slug: 'parapente-vuelo',
    image_url: null,
    alt_text: 'Planeo silencioso sobre las corrientes térmicas de la cordillera',
    display_order: 9,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'parapente-tandem-canon',
    raffle_id: null,
    title: 'Tándem Extremo en el Cañón',
    category: 'parapente',
    image_slug: 'parapente-tandem-canon',
    image_url: null,
    alt_text: 'Vuelo tándem seguro con instructor certificado en el cañón de Manaure',
    display_order: 10,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-perija-laguna',
    raffle_id: null,
    title: 'Laguna Escondida de Alta Montaña',
    category: 'serrania',
    image_slug: 'serrania-perija-laguna',
    image_url: null,
    alt_text: 'Espejo de agua cristalina en las alturas de la Serranía del Perijá',
    display_order: 11,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-perija-frailejones',
    raffle_id: null,
    title: 'Páramo y Frailejones',
    category: 'serrania',
    image_slug: 'serrania-perija-frailejones',
    image_url: null,
    alt_text: 'Vegetación endémica de frailejones en el ecosistema de páramo',
    display_order: 12,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-perija-cordillera',
    raffle_id: null,
    title: 'Cordillera Majestuosa de Perijá',
    category: 'serrania',
    image_slug: 'serrania-perija-cordillera',
    image_url: null,
    alt_text: 'Vistas panorámicas del macizo montañoso de la Serranía del Perijá',
    display_order: 13,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-pozo-cristalino',
    raffle_id: null,
    title: 'Pozo de Agua Cristalina',
    category: 'serrania',
    image_slug: 'serrania-pozo-cristalino',
    image_url: null,
    alt_text: 'Piscina natural de vertiente andina rodeada de vegetación',
    display_order: 14,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-los-pinos',
    raffle_id: null,
    title: 'Mirador Los Pinos',
    category: 'serrania',
    image_slug: 'serrania-los-pinos',
    image_url: null,
    alt_text: 'Senderos bajo bosque de pinos con vista a las nubes',
    display_order: 15,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'serrania-sabana-rubia',
    raffle_id: null,
    title: 'Sabana Rubia y Frontera',
    category: 'serrania',
    image_slug: 'serrania-sabana-rubia',
    image_url: null,
    alt_text: 'Planicie de alta montaña en Sabana Rubia, páramo del Perijá',
    display_order: 16,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'gastronomia-casa-arepas',
    raffle_id: null,
    title: 'La Casa de las Arepas',
    category: 'gastronomia',
    image_slug: 'gastronomia-casa-arepas',
    image_url: null,
    alt_text: 'Degustación de arepa rellena artesanal y gastronomía local tradicional',
    display_order: 17,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
  {
    id: 'fogata-casa-de-vidrio',
    raffle_id: null,
    title: 'Fogata en la Casa de Vidrio',
    category: 'fogata',
    image_slug: 'fogata-casa-de-vidrio',
    image_url: null,
    alt_text: 'Fogata cálida al caer la tarde en la terraza mirador de la Casa de Vidrio',
    display_order: 18,
    is_active: true,
    created_at: '2026-09-20T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
  },
];

/**
 * Formatea mensajes de error amigables para el administrador.
 */
function formatGalleryError(rawError: string): string {
  if (!rawError) return 'Error inesperado al gestionar la galería fotográfica.';

  if (
    rawError.includes('schema cache') ||
    rawError.includes("Could not find the table 'public.gallery_items'") ||
    rawError.includes('relation "gallery_items" does not exist')
  ) {
    console.warn('[galleryService] Tabla gallery_items no disponible en backend:', rawError);
    return 'No fue posible acceder a los elementos de la galería. El servicio no está disponible temporalmente.';
  }

  if (
    rawError.includes('violates row-level security policy') ||
    rawError.includes('permission denied') ||
    rawError.includes('new row violates')
  ) {
    console.warn('[galleryService] Permisos insuficientes para gestionar la galería:', rawError);
    return 'Permisos denegados: tu cuenta no cuenta con privilegios de administrador autorizados para gestionar la galería.';
  }

  if (
    rawError.includes('gallery_categories') ||
    rawError.includes("Could not find the table 'public.gallery_categories'") ||
    rawError.includes('relation "gallery_categories" does not exist')
  ) {
    console.warn('[galleryService] Tabla gallery_categories no disponible en backend:', rawError);
    return 'No fue posible cargar las categorías de la galería. Por favor intenta más tarde.';
  }

  if (rawError.includes('bucket not found') || rawError.includes('gallery-images')) {
    console.warn('[galleryService] Almacenamiento de imágenes no disponible:', rawError);
    return 'El almacenamiento de imágenes de la galería no se encuentra disponible temporalmente.';
  }

  return rawError;
}

/**
 * Recupera las fotos de la galería desde la caché local de localStorage.
 */
export function getCachedGalleryItems(): GalleryItemRow[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(GALLERY_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GalleryCachePayload;
        if (
          parsed?.version === GALLERY_CACHE_VERSION &&
          Array.isArray(parsed?.data) &&
          parsed.data.length > 0
        ) {
          return parsed.data;
        }
      }
    }
  } catch {
    // Si localStorage está restringido o falla, se continúa con el respaldo
  }

  return FALLBACK_GALLERY_ITEMS;
}

/**
 * Guarda las fotos de la galería en localStorage.
 */
export function setCachedGalleryItems(data: GalleryItemRow[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const payload: GalleryCachePayload = {
        version: GALLERY_CACHE_VERSION,
        timestamp: Date.now(),
        data,
      };
      localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignorar en entornos con cuota llena o cookies desactivadas
  }
}

/**
 * Consulta las fotos activas de la galería para la landing pública con estrategia cache-first.
 */
export async function getPublicGalleryItems(raffleId?: string | null): Promise<GalleryItemRow[]> {
  try {
    let query = supabase
      .from('gallery_items')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (raffleId) {
      query = query.or(`raffle_id.eq.${raffleId},raffle_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      if (import.meta.env.DEV) {
        console.info('[galleryService] Usando fotos locales de respaldo:', error.message);
      }
      return getCachedGalleryItems();
    }

    if (data && data.length > 0) {
      const rows = data as GalleryItemRow[];
      setCachedGalleryItems(rows);
      return rows;
    }

    return getCachedGalleryItems();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.info('[galleryService] Excepción de red, usando respaldo local:', err);
    }
    return getCachedGalleryItems();
  }
}

/**
 * Consulta todas las fotos de la galería para el panel administrativo (activas y ocultas).
 */
export async function getAdminGalleryItems(
  raffleId?: string | null
): Promise<{ success: boolean; data?: GalleryItemRow[]; error?: string }> {
  try {
    let query = supabase
      .from('gallery_items')
      .select('*')
      .order('display_order', { ascending: true });

    if (raffleId) {
      query = query.or(`raffle_id.eq.${raffleId},raffle_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: formatGalleryError(error.message) };
    }

    return { success: true, data: (data as GalleryItemRow[]) || [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al consultar la galería.',
    };
  }
}

/**
 * Agrega una nueva fotografía a la galería.
 */
export async function createGalleryItem(
  payload: GalleryItemInsert
): Promise<{ success: boolean; data?: GalleryItemRow; error?: string }> {
  try {
    if (!payload.title || !payload.title.trim()) {
      return { success: false, error: 'El título de la fotografía es obligatorio.' };
    }

    if (!payload.image_slug && !payload.image_url) {
      return {
        success: false,
        error: 'Debes seleccionar una foto del catálogo local o subir una fotografía.',
      };
    }

    // Calcular siguiente display_order si no fue provisto
    let nextOrder = payload.display_order;
    if (nextOrder === undefined || nextOrder === null) {
      const { data: maxRow } = await supabase
        .from('gallery_items')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      nextOrder = maxRow ? (maxRow.display_order || 0) + 1 : 1;
    }

    const { data, error } = await supabase
      .from('gallery_items')
      .insert({
        title: payload.title.trim(),
        category: payload.category || 'serrania',
        image_slug: payload.image_slug ? payload.image_slug.trim() : null,
        image_url: payload.image_url ? payload.image_url.trim() : null,
        alt_text: payload.alt_text ? payload.alt_text.trim() : payload.title.trim(),
        raffle_id: payload.raffle_id || null,
        display_order: nextOrder,
        is_active: payload.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: formatGalleryError(error.message) };
    }

    return { success: true, data: data as GalleryItemRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear la fotografía.',
    };
  }
}

/**
 * Actualiza una fotografía existente en la galería.
 */
export async function updateGalleryItem(
  id: string,
  updates: GalleryItemUpdate
): Promise<{ success: boolean; data?: GalleryItemRow; error?: string }> {
  try {
    const payload: GalleryItemUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.alt_text !== undefined) payload.alt_text = updates.alt_text?.trim() || null;
    if (updates.image_slug !== undefined) payload.image_slug = updates.image_slug?.trim() || null;
    if (updates.image_url !== undefined) payload.image_url = updates.image_url?.trim() || null;
    if (updates.raffle_id !== undefined) payload.raffle_id = updates.raffle_id || null;
    if (updates.display_order !== undefined) payload.display_order = updates.display_order;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;

    const { data, error } = await supabase
      .from('gallery_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: formatGalleryError(error.message) };
    }

    return { success: true, data: data as GalleryItemRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar la fotografía.',
    };
  }
}

/**
 * Elimina una fotografía de la galería. Si la foto provenía del bucket 'gallery-images',
 * elimina también el archivo físico de Storage.
 */
export async function deleteGalleryItem(
  id: string,
  imageUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Si la foto está alojada en nuestro bucket de Supabase Storage, eliminarla físicamente
    if (imageUrl && imageUrl.includes('gallery-images')) {
      try {
        const parts = imageUrl.split('/gallery-images/');
        if (parts[1]) {
          const fileName = parts[1].split('?')[0];
          await supabase.storage.from('gallery-images').remove([fileName]);
        }
      } catch (storageErr) {
        console.warn('[galleryService] Advertencia al eliminar archivo físico de Storage:', storageErr);
      }
    }

    const { error } = await supabase.from('gallery_items').delete().eq('id', id);

    if (error) {
      return { success: false, error: formatGalleryError(error.message) };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar la fotografía.',
    };
  }
}

/**
 * Alterna rápidamente la visibilidad pública de una foto (activa / oculta).
 */
export async function toggleGalleryItemActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('gallery_items')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: formatGalleryError(error.message) };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cambiar visibilidad de la foto.',
    };
  }
}

/**
 * Reordena una lista de fotografías de la galería.
 */
export async function reorderGalleryItems(
  items: { id: string; display_order: number }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const item of items) {
      const { error } = await supabase
        .from('gallery_items')
        .update({
          display_order: item.display_order,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) {
        return { success: false, error: formatGalleryError(error.message) };
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al reordenar las fotografías.',
    };
  }
}

/**
 * Sube una fotografía al bucket 'gallery-images' de Supabase Storage.
 * Acepta formatos WebP, JPG, PNG, AVIF hasta 10 MB.
 * No impone restricciones rígidas de aspecto ni resolución, basta que tenga buena calidad.
 */
export async function uploadGalleryPhoto(
  file: File,
  prefix = 'galeria'
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Formato inválido. Se admiten imágenes WebP, JPG, PNG o AVIF.',
      };
    }

    // 10 MB límite
    if (file.size > 10 * 1024 * 1024) {
      return {
        success: false,
        error: 'La imagen supera el límite recomendado de 10 MB.',
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
      .from('gallery-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[galleryService] Error en Storage:', uploadError);
      return {
        success: false,
        error: formatGalleryError(uploadError.message),
      };
    }

    const { data: publicData } = supabase.storage.from('gallery-images').getPublicUrl(fileName);

    return {
      success: true,
      url: publicData.publicUrl,
    };
  } catch (err) {
    console.error('[galleryService] Error inesperado en uploadGalleryPhoto:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al subir la fotografía a la galería.',
    };
  }
}

/**
 * Normaliza y genera un slug limpio para una categoría (sin tildes, minúsculas y separado por guiones).
 */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Recupera las categorías de la galería desde la caché local de localStorage.
 */
export function getCachedGalleryCategories(): GalleryCategoryItem[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(GALLERY_CATEGORIES_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GalleryCategoriesCachePayload;
        if (
          parsed?.version === GALLERY_CATEGORIES_CACHE_VERSION &&
          Array.isArray(parsed?.data) &&
          parsed.data.length > 0
        ) {
          return parsed.data;
        }
      }
    }
  } catch {
    // Si localStorage no está disponible o falla, fallback seguro
  }

  return DEFAULT_GALLERY_CATEGORIES;
}

/**
 * Guarda las categorías de la galería en localStorage.
 */
export function setCachedGalleryCategories(data: GalleryCategoryItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const payload: GalleryCategoriesCachePayload = {
        version: GALLERY_CATEGORIES_CACHE_VERSION,
        timestamp: Date.now(),
        data,
      };
      localStorage.setItem(GALLERY_CATEGORIES_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignorar si hay restricciones de almacenamiento
  }
}

/**
 * Consulta las categorías activas de la galería (con estrategia cache-first y fallback silencioso).
 */
export async function getGalleryCategories(): Promise<GalleryCategoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('gallery_categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) {
        console.info('[galleryService] Usando categorías locales de respaldo:', error.message);
      }
      return getCachedGalleryCategories();
    }

    if (data && data.length > 0) {
      const defaultSlugs = ['cuatrimoto', 'parapente', 'serrania', 'hospedaje', 'gastronomia', 'fogata', 'otro'];
      const mapped: GalleryCategoryItem[] = (data as GalleryCategoryRow[]).map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        display_order: r.display_order,
        is_active: r.is_active,
        is_default: defaultSlugs.includes(r.slug),
      }));
      setCachedGalleryCategories(mapped);
      return mapped;
    }

    return getCachedGalleryCategories();
  } catch (err) {
    console.error('[galleryService] Error al obtener categorías:', err);
    return getCachedGalleryCategories();
  }
}

/**
 * Crea una nueva categoría de fotos para la galería.
 */
export async function createGalleryCategory(
  name: string,
  customSlug?: string
): Promise<{ success: boolean; category?: GalleryCategoryItem; error?: string }> {
  try {
    const cleanName = name.trim();
    if (!cleanName) {
      return { success: false, error: 'El nombre de la categoría es obligatorio.' };
    }

    const slug = customSlug?.trim() ? slugifyCategory(customSlug) : slugifyCategory(cleanName);
    if (!slug) {
      return { success: false, error: 'No se pudo generar un identificador (slug) válido.' };
    }

    // Verificar si ya existe en la lista actual
    const currentCategories = getCachedGalleryCategories();
    if (currentCategories.some((c) => c.slug === slug)) {
      return { success: false, error: `Ya existe una categoría con el identificador "${slug}".` };
    }

    const nextOrder = currentCategories.length > 0
      ? Math.max(...currentCategories.map((c) => c.display_order)) + 1
      : 1;

    const { data, error } = await supabase
      .from('gallery_categories')
      .insert([
        {
          slug,
          name: cleanName,
          display_order: nextOrder,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.warn('[galleryService] Error en Supabase al crear categoría, guardando en respaldo local:', error.message);
      const newLocalCat: GalleryCategoryItem = {
        id: `local-${slug}-${Date.now()}`,
        slug,
        name: cleanName,
        display_order: nextOrder,
        is_active: true,
        is_default: false,
      };
      const updatedList = [...currentCategories, newLocalCat];
      setCachedGalleryCategories(updatedList);
      return { success: true, category: newLocalCat };
    }

    const newCategory: GalleryCategoryItem = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      display_order: data.display_order,
      is_active: data.is_active,
      is_default: false,
    };

    const updatedList = [...currentCategories.filter((c) => c.slug !== slug), newCategory];
    setCachedGalleryCategories(updatedList);

    return { success: true, category: newCategory };
  } catch (err) {
    console.error('[galleryService] Error inesperado en createGalleryCategory:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear la categoría.',
    };
  }
}

/**
 * Elimina una categoría de la galería de manera segura:
 * 1. Reasigna automáticamente todas las fotos de esa categoría a 'otro' para proteger su visibilidad.
 * 2. Elimina la categoría de Supabase y de la caché local.
 */
export async function deleteGalleryCategory(
  slug: string
): Promise<{ success: boolean; reassignedPhotosCount: number; error?: string }> {
  try {
    if (slug === 'otro') {
      return {
        success: false,
        reassignedPhotosCount: 0,
        error: 'La categoría base "Otra Experiencia" (otro) no puede ser eliminada porque actúa como respaldo del sistema.',
      };
    }

    let reassignedCount = 0;

    // 1. Reasignar fotos existentes que tengan esta categoría a 'otro' en Supabase
    try {
      const { data: affectedPhotos } = await supabase
        .from('gallery_items')
        .select('id')
        .eq('category', slug);

      if (affectedPhotos && affectedPhotos.length > 0) {
        reassignedCount = affectedPhotos.length;
        await supabase
          .from('gallery_items')
          .update({ category: 'otro' })
          .eq('category', slug);
      }
    } catch (reassignError) {
      console.warn('[galleryService] Advertencia al reasignar fotos en Supabase:', reassignError);
    }

    // 2. Eliminar la categoría de Supabase
    const { error: deleteError } = await supabase
      .from('gallery_categories')
      .delete()
      .eq('slug', slug);

    if (deleteError) {
      console.warn('[galleryService] Advertencia al eliminar categoría en Supabase, aplicando localmente:', deleteError.message);
    }

    // 3. Reasignar en la caché local de fotos si existían
    const cachedItems = getCachedGalleryItems();
    let localReassigned = 0;
    const updatedItems = cachedItems.map((item) => {
      if (item.category === slug) {
        localReassigned++;
        return { ...item, category: 'otro' };
      }
      return item;
    });

    if (localReassigned > 0) {
      setCachedGalleryItems(updatedItems);
      if (reassignedCount === 0) {
        reassignedCount = localReassigned;
      }
    }

    // 4. Remover de la caché local de categorías
    const currentCategories = getCachedGalleryCategories();
    const updatedCategories = currentCategories.filter((c) => c.slug !== slug);
    setCachedGalleryCategories(updatedCategories);

    return {
      success: true,
      reassignedPhotosCount: reassignedCount,
    };
  } catch (err) {
    console.error('[galleryService] Error inesperado en deleteGalleryCategory:', err);
    return {
      success: false,
      reassignedPhotosCount: 0,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar la categoría.',
    };
  }
}

