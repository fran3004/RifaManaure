import { supabase } from '@/lib/supabase';
import { FALLBACK_FAQS } from '@/data/faqFallback';
import type { FaqItem, FaqCachePayload } from '@/types/raffle.types';

export const FAQ_CACHE_KEY = 'manaure_faq_cache';
export const FAQ_CACHE_VERSION = 1;

/**
 * Formatea mensajes de error amigables para el administrador.
 */
function formatFaqError(rawError: string): string {
  if (!rawError) return 'Error inesperado al gestionar las preguntas frecuentes.';

  if (
    rawError.includes('schema cache') ||
    rawError.includes("Could not find the table 'public.faq_items'") ||
    rawError.includes('relation "faq_items" does not exist')
  ) {
    return "La tabla 'public.faq_items' no existe en Supabase. Ejecuta la migración 032_faq_items.sql en el SQL Editor de tu proyecto.";
  }

  if (
    rawError.includes('violates row-level security policy') ||
    rawError.includes('permission denied') ||
    rawError.includes('new row violates')
  ) {
    return 'Permisos denegados por seguridad (RLS): debes ejecutar la migración 034_faq_admin_policies.sql en el SQL Editor de Supabase y contar con rol de administrador activo.';
  }

  return rawError;
}

/**
 * Recupera las preguntas frecuentes de la caché síncrona de localStorage.
 * Si no hay caché válida o ha ocurrido un error, retorna las preguntas de respaldo (FALLBACK_FAQS).
 */
export function getCachedFaqs(): FaqItem[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(FAQ_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FaqCachePayload;
        if (
          parsed?.version === FAQ_CACHE_VERSION &&
          Array.isArray(parsed?.data) &&
          parsed.data.length > 0
        ) {
          return parsed.data;
        }
      }
    }
  } catch {
    // Si localStorage falla o está restringido, se recurre al respaldo local sin romper la ejecución
  }

  return FALLBACK_FAQS;
}

/**
 * Almacena las preguntas frecuentes en localStorage con versión y timestamp.
 */
export function setCachedFaqs(data: FaqItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const payload: FaqCachePayload = {
        version: FAQ_CACHE_VERSION,
        timestamp: Date.now(),
        data,
      };
      localStorage.setItem(FAQ_CACHE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Silencioso en caso de cuota excedida o almacenamiento deshabilitado
  }
}

/**
 * Consulta las preguntas frecuentes publicadas desde Supabase con estrategia cache-first.
 * Si la consulta falla (red, tabla ausente, etc.), captura silenciosamente y retorna la caché o respaldo.
 */
export async function getPublicFaqs(): Promise<FaqItem[]> {
  try {
    const { data, error } = await supabase
      .from('faq_items')
      .select('id, question, answer, sort_order, is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) {
        console.info('[faqService] Usando respaldo local de preguntas frecuentes:', error.message);
      }
      return getCachedFaqs();
    }

    if (data && data.length > 0) {
      const items: FaqItem[] = data.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        sort_order: row.sort_order,
        is_published: row.is_published,
      }));

      setCachedFaqs(items);
      return items;
    }

    // Si la tabla responde vacía, usar caché/respaldo
    return getCachedFaqs();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.info('[faqService] Usando respaldo local de preguntas frecuentes:', err);
    }
    return getCachedFaqs();
  }
}

/**
 * Consulta todas las preguntas frecuentes para el panel administrativo (publicadas y no publicadas).
 */
export async function getAdminFaqs(): Promise<FaqItem[]> {
  try {
    const { data, error } = await supabase
      .from('faq_items')
      .select('id, question, answer, sort_order, is_published')
      .order('sort_order', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) {
        console.info('[faqService] Advertencia en getAdminFaqs, usando fallback:', error.message);
      }
      return getCachedFaqs();
    }

    if (data && data.length > 0) {
      return data.map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        sort_order: row.sort_order,
        is_published: row.is_published,
      }));
    }

    return getCachedFaqs();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.info('[faqService] Excepción en getAdminFaqs:', err);
    }
    return getCachedFaqs();
  }
}

/**
 * Crea una nueva pregunta frecuente en Supabase.
 */
export async function createFaq(payload: {
  question: string;
  answer: string;
  sort_order?: number;
  is_published?: boolean;
}): Promise<{ success: boolean; data?: FaqItem; error?: string }> {
  try {
    const question = payload.question.trim();
    const answer = payload.answer.trim();

    if (!question) {
      return { success: false, error: 'La pregunta no puede estar vacía.' };
    }
    if (!answer) {
      return { success: false, error: 'La respuesta no puede estar vacía.' };
    }

    let sortOrder = payload.sort_order;
    if (typeof sortOrder !== 'number' || isNaN(sortOrder)) {
      // Calcular siguiente orden
      const existing = await getAdminFaqs();
      const maxOrder = existing.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0);
      sortOrder = maxOrder + 10;
    }

    const { data, error } = await supabase
      .from('faq_items')
      .insert({
        question,
        answer,
        sort_order: sortOrder,
        is_published: payload.is_published ?? true,
      })
      .select('id, question, answer, sort_order, is_published')
      .single();

    if (error) {
      return { success: false, error: formatFaqError(error.message) };
    }

    const newItem: FaqItem = {
      id: data.id,
      question: data.question,
      answer: data.answer,
      sort_order: data.sort_order,
      is_published: data.is_published,
    };

    // Actualizar caché pública local si está publicada
    if (newItem.is_published) {
      const currentCache = getCachedFaqs();
      const updated = [...currentCache, newItem].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
      setCachedFaqs(updated);
    }

    return { success: true, data: newItem };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear la pregunta frecuente.',
    };
  }
}

/**
 * Actualiza una pregunta frecuente existente.
 */
export async function updateFaq(
  id: string,
  updates: Partial<Omit<FaqItem, 'id'>>
): Promise<{ success: boolean; data?: FaqItem; error?: string }> {
  try {
    if (!id) {
      return { success: false, error: 'ID de pregunta no especificado.' };
    }

    const payload: Record<string, unknown> = {};
    if (updates.question !== undefined) payload.question = updates.question.trim();
    if (updates.answer !== undefined) payload.answer = updates.answer.trim();
    if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
    if (updates.is_published !== undefined) payload.is_published = updates.is_published;

    if (payload.question === '') {
      return { success: false, error: 'La pregunta no puede estar vacía.' };
    }
    if (payload.answer === '') {
      return { success: false, error: 'La respuesta no puede estar vacía.' };
    }

    const { data, error } = await supabase
      .from('faq_items')
      .update(payload)
      .eq('id', id)
      .select('id, question, answer, sort_order, is_published')
      .single();

    if (error) {
      return { success: false, error: formatFaqError(error.message) };
    }

    const updatedItem: FaqItem = {
      id: data.id,
      question: data.question,
      answer: data.answer,
      sort_order: data.sort_order,
      is_published: data.is_published,
    };

    // Refrescar caché local
    const currentCache = getCachedFaqs();
    const updatedCache = currentCache.map((item) => (item.id === id ? updatedItem : item));
    setCachedFaqs(updatedCache);

    return { success: true, data: updatedItem };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar la pregunta frecuente.',
    };
  }
}

/**
 * Elimina una pregunta frecuente por su ID.
 */
export async function deleteFaq(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) {
      return { success: false, error: 'ID de pregunta no especificado.' };
    }

    const { error } = await supabase.from('faq_items').delete().eq('id', id);

    if (error) {
      return { success: false, error: formatFaqError(error.message) };
    }

    // Remover de caché local
    const currentCache = getCachedFaqs();
    const filtered = currentCache.filter((item) => item.id !== id);
    setCachedFaqs(filtered);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar la pregunta frecuente.',
    };
  }
}

/**
 * Alterna el estado de publicación (publicada / oculta) de una pregunta frecuente.
 */
export async function toggleFaqPublished(
  id: string,
  isPublished: boolean
): Promise<{ success: boolean; error?: string }> {
  const result = await updateFaq(id, { is_published: isPublished });
  return { success: result.success, error: result.error };
}

/**
 * Actualiza el orden (sort_order) de múltiples preguntas en lote.
 */
export async function reorderFaqs(
  items: { id: string; sort_order: number }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    for (const item of items) {
      const { error } = await supabase
        .from('faq_items')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id);

      if (error) {
        return { success: false, error: formatFaqError(error.message) };
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al reordenar las preguntas frecuentes.',
    };
  }
}
