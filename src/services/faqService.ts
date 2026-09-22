import { supabase } from '@/lib/supabase';
import { FALLBACK_FAQS } from '@/data/faqFallback';
import type { FaqItem, FaqCachePayload } from '@/types/raffle.types';

export const FAQ_CACHE_KEY = 'manaure_faq_cache';
export const FAQ_CACHE_VERSION = 1;

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

