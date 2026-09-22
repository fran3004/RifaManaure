import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedFaqs,
  setCachedFaqs,
  getPublicFaqs,
  getAdminFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  toggleFaqPublished,
  reorderFaqs,
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

  it('debe consultar todas las preguntas para administradores con getAdminFaqs', async () => {
    const mockDbData = [
      {
        id: 'admin-1',
        question: 'Pregunta activa',
        answer: 'Respuesta 1',
        sort_order: 10,
        is_published: true,
      },
      {
        id: 'admin-2',
        question: 'Pregunta borrador',
        answer: 'Respuesta 2',
        sort_order: 20,
        is_published: false,
      },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: mockDbData, error: null });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    });

    const adminFaqs = await getAdminFaqs();
    expect(adminFaqs).toHaveLength(2);
    expect(adminFaqs[1].is_published).toBe(false);
  });

  it('debe crear una nueva pregunta con createFaq validando campos', async () => {
    // Validación de campos vacíos
    const emptyResult = await createFaq({ question: '', answer: '' });
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toContain('vacía');

    // Inserción exitosa
    const mockCreated = {
      id: 'new-id',
      question: '¿Nueva pregunta?',
      answer: 'Nueva respuesta',
      sort_order: 10,
      is_published: true,
    };

    const mockInsert = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ data: mockCreated, error: null });

    (supabase.from as any).mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
    });

    const result = await createFaq({
      question: '¿Nueva pregunta?',
      answer: 'Nueva respuesta',
      sort_order: 10,
      is_published: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('new-id');
  });

  it('debe actualizar una pregunta existente con updateFaq', async () => {
    const mockUpdated = {
      id: 'edit-id',
      question: '¿Pregunta editada?',
      answer: 'Respuesta editada',
      sort_order: 15,
      is_published: true,
    };

    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdated, error: null });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
      select: mockSelect,
      single: mockSingle,
    });

    const result = await updateFaq('edit-id', {
      question: '¿Pregunta editada?',
      answer: 'Respuesta editada',
      sort_order: 15,
    });

    expect(result.success).toBe(true);
    expect(result.data?.question).toBe('¿Pregunta editada?');
  });

  it('debe eliminar una pregunta con deleteFaq', async () => {
    const mockDelete = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockReturnValue({
      delete: mockDelete,
      eq: mockEq,
    });

    const result = await deleteFaq('delete-id');
    expect(result.success).toBe(true);
  });

  it('debe alternar publicación con toggleFaqPublished', async () => {
    const mockUpdated = {
      id: 'toggle-id',
      question: 'Pregunta',
      answer: 'Respuesta',
      sort_order: 10,
      is_published: false,
    };

    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdated, error: null });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
      select: mockSelect,
      single: mockSingle,
    });

    const result = await toggleFaqPublished('toggle-id', false);
    expect(result.success).toBe(true);
  });

  it('debe reordenar preguntas con reorderFaqs', async () => {
    const mockUpdate = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    });

    const result = await reorderFaqs([
      { id: '1', sort_order: 20 },
      { id: '2', sort_order: 10 },
    ]);
    expect(result.success).toBe(true);
  });
});
