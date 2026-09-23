import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatFaqAnswer,
  formatDrawDate,
  COLOMBIAN_LOTTERIES,
  saveCachedRaffle,
  getStoredCachedRaffle,
  RAFFLE_CACHE_KEY,
  RAFFLE_UPDATED_EVENT,
} from '@/hooks/useActiveRaffle';
import type { RaffleRow } from '@/types/raffle.types';

describe('useActiveRaffle & Loterías Dinámicas', () => {
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

  describe('COLOMBIAN_LOTTERIES', () => {
    it('debe contener las loterías más populares de Colombia, incluyendo El Sinuano', () => {
      expect(COLOMBIAN_LOTTERIES).toContain('Lotería del Sinuano');
      expect(COLOMBIAN_LOTTERIES).toContain('El Sinuano Noche');
      expect(COLOMBIAN_LOTTERIES).toContain('Lotería de Santander');
      expect(COLOMBIAN_LOTTERIES).toContain('Lotería de Boyacá');
      expect(COLOMBIAN_LOTTERIES).toContain('Lotería de Medellín');
      expect(COLOMBIAN_LOTTERIES).toContain('Lotería del Valle');
      expect(COLOMBIAN_LOTTERIES.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('formatFaqAnswer', () => {
    const baseAnswer =
      'El ganador se define de manera 100% transparente con las 3 últimas cifras del Premio Mayor de la Lotería de Santander en la fecha estipulada del sorteo.';

    it('debe reemplazar "Lotería de Santander" por cualquier lotería configurada dinámicamente', () => {
      const result = formatFaqAnswer(baseAnswer, {
        lotteryReference: 'Lotería del Sinuano',
      });
      expect(result).toContain('Lotería del Sinuano');
      expect(result).not.toContain('Lotería de Santander');
    });

    it('debe reemplazar adecuadamente si la lotería incluye texto adicional como 2 cifras', () => {
      const result = formatFaqAnswer(baseAnswer, {
        lotteryReference: 'loteria de sinuano, premio ganador de 2 cifras',
      });
      expect(result).toContain('loteria de sinuano, premio ganador de 2 cifras');
      expect(result).not.toContain('Lotería de Santander');
    });

    it('debe reemplazar las cifras si se proporciona cifrasText', () => {
      const result = formatFaqAnswer(baseAnswer, {
        lotteryReference: 'El Sinuano Noche',
        cifrasText: 'dos (2) cifras',
      });
      expect(result).toContain('dos (2) cifras');
      expect(result).toContain('El Sinuano Noche');
      expect(result).not.toContain('3 últimas cifras');
    });

    it('debe devolver el texto original si no se proporcionan datos de contexto', () => {
      const result = formatFaqAnswer(baseAnswer, {});
      expect(result).toBe(baseAnswer);
    });
  });

  describe('formatDrawDate', () => {
    it('debe formatear fechas ISO en español legible para Colombia', () => {
      const isoDate = '2026-11-20T20:00:00.000Z';
      const formatted = formatDrawDate(isoDate);
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(5);
    });

    it('debe retornar mensaje por defecto si la fecha es nula o vacía', () => {
      expect(formatDrawDate(null)).toBe('Fecha por definir');
      expect(formatDrawDate(undefined)).toBe('Fecha por definir');
      expect(formatDrawDate('')).toBe('Fecha por definir');
    });
  });

  describe('saveCachedRaffle & getStoredCachedRaffle', () => {
    const mockRaffle: RaffleRow = {
      id: 'raf-123',
      title: 'Sorteo Manaure Vive',
      slug: 'sorteo-manaure-vive',
      description: 'Premio ecoturístico',
      ticket_price: 25000,
      total_tickets: 100,
      status: 'active',
      draw_date: '2026-12-15T20:00:00Z',
      lottery_reference: 'Lotería del Sinuano (2 cifras)',
      hero_image_url: null,
      max_tickets_per_buyer: 20,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    it('debe guardar la rifa en localStorage y emitir evento custom RAFFLE_UPDATED_EVENT si window existe', () => {
      let dispatchedEvent: unknown = null;
      const windowMock = {
        dispatchEvent: vi.fn((e: unknown) => {
          dispatchedEvent = e;
          return true;
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('window', windowMock);

      saveCachedRaffle(mockRaffle);

      const stored = getStoredCachedRaffle();
      expect(stored).toEqual(mockRaffle);
      expect(windowMock.dispatchEvent).toHaveBeenCalled();
      const customEvt = dispatchedEvent as CustomEvent<RaffleRow>;
      expect(customEvt.type).toBe(RAFFLE_UPDATED_EVENT);
      expect(customEvt.detail).toEqual(mockRaffle);

      vi.unstubAllGlobals();
    });

    it('debe retornar null si no hay nada guardado en caché', () => {
      delete store[RAFFLE_CACHE_KEY];
      expect(getStoredCachedRaffle()).toBeNull();
    });
  });
});
