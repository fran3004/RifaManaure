import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedFaqs,
  setCachedFaqs,
  getPublicFaqs,
  FAQ_CACHE_KEY,
  FAQ_CACHE_VERSION,
} from '@/services/faqService';
import { FALLBACK_FAQS } from '@/data/faqFallback';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('faqService - Gestión de Preguntas Frecuentes', () => {
  let store: Record<string, string> = {};

  const localStorageMock = {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
  });

  it('debe devolver FALLBACK_FAQS si la caché de localStorage está vacía', () => {
    const data = getCachedFaqs();
    expect(data).toBeDefined();
    expect(data).toHaveLength(6);
    expect(data[1].question).toBe('¿Qué incluye exactamente el paquete para 2 personas?');
    expect(data[1].answer).toContain('Tour Vive Manaure de 3 días y 2 noches para la pareja (2 personas) con viaje pago ida y vuelta');
    expect(data[5].question).toBe('¿Cuáles son los métodos de pago disponibles?');
    expect(data[5].answer).toContain('Aceptamos transferencias directas mediante Bre-B, Nequi, Daviplata, Bancolombia');
  });

  it('debe almacenar y recuperar los datos en caché con versión correcta', () => {
    const customFaqs = [
      {
        id: 'test-1',
        question: '¿Pregunta de prueba?',
        answer: 'Respuesta de prueba',
        sort_order: 10,
        is_published: true,
      },
    ];

    setCachedFaqs(customFaqs);
    expect(store[FAQ_CACHE_KEY]).toBeDefined();
    const parsed = JSON.parse(store[FAQ_CACHE_KEY]);
    expect(parsed.version).toBe(FAQ_CACHE_VERSION);

    const retrieved = getCachedFaqs();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].question).toBe('¿Pregunta de prueba?');
  });

  it('debe ignorar datos de caché con versión desactualizada o corrupta y caer en fallback', () => {
    store[FAQ_CACHE_KEY] = JSON.stringify({
      version: 999, // Versión no coincidente
      data: [{ question: 'Invalido', answer: 'Invalido' }],
    });

    const retrieved = getCachedFaqs();
    expect(retrieved).toHaveLength(FALLBACK_FAQS.length);
    expect(retrieved[0].question).toBe(FALLBACK_FAQS[0].question);
  });

  it('debe consultar Supabase y actualizar la caché cuando la consulta es exitosa', async () => {
    const mockDbData = [
      {
        id: 'db-1',
        question: '¿Pregunta desde Supabase?',
        answer: 'Respuesta desde Supabase',
        sort_order: 10,
        is_published: true,
      },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: mockDbData, error: null });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
    });

    const faqs = await getPublicFaqs();

    expect(faqs).toHaveLength(1);
    expect(faqs[0].question).toBe('¿Pregunta desde Supabase?');
    expect(store[FAQ_CACHE_KEY]).toBeDefined();
    const parsedCache = JSON.parse(store[FAQ_CACHE_KEY]);
    expect(parsedCache.data[0].question).toBe('¿Pregunta desde Supabase?');
  });

  it('debe caer silenciosamente al respaldo local si Supabase devuelve error', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'relation "faq_items" does not exist' },
    });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
    });

    const faqs = await getPublicFaqs();

    // Debe devolver el fallback sin lanzar excepción
    expect(faqs).toHaveLength(6);
    expect(faqs[0].question).toBe(FALLBACK_FAQS[0].question);
  });
});
