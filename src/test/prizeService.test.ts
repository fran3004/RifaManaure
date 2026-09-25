import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedPrizeDetails,
  PRIZE_CACHE_KEY,
  DEFAULT_PRIZE_SETTINGS,
  DEFAULT_PRIZE_EXPERIENCES,
} from '@/services/prizeService';

describe('prizeService - Gestión del Premio Mayor', () => {
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
  });

  it('debe devolver los valores predeterminados si la caché de localStorage está vacía', () => {
    const data = getCachedPrizeDetails();

    expect(data).toBeDefined();
    expect(data.settings.id).toBe('main');
    expect(data.settings.badge_text).toBe(DEFAULT_PRIZE_SETTINGS.badge_text);
    expect(data.settings.title).toBe(DEFAULT_PRIZE_SETTINGS.title);
    expect(data.experiences).toHaveLength(DEFAULT_PRIZE_EXPERIENCES.length);
    expect(data.experiences[0].title).toBe('Paseo en Cuatrimoto por Trochas');
  });

  it('debe recuperar fielmente los datos guardados previamente en caché', () => {
    const customData = {
      settings: {
        id: 'main',
        badge_text: 'Premio Especial de Verano',
        title: '¡Gana la Gran Aventura Manaure!',
        subtitle: 'Una experiencia inolvidable para dos personas.',
        updated_at: new Date().toISOString(),
      },
      experiences: [
        {
          id: 'custom-1',
          title: 'Alojamiento Exclusivo VIP',
          partner_name: 'Resort Campestre',
          description: '3 días y 2 noches todo incluido.',
          features: ['Desayuno gourmet', 'Piscina privada'],
          image_url: 'https://example.com/custom.jpg',
          image_slug: null,
          icon: 'Sparkles',
          display_order: 1,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };

    localStorage.setItem(PRIZE_CACHE_KEY, JSON.stringify(customData));

    const retrieved = getCachedPrizeDetails();

    expect(retrieved.settings.badge_text).toBe('Premio Especial de Verano');
    expect(retrieved.settings.title).toBe('¡Gana la Gran Aventura Manaure!');
    expect(retrieved.experiences).toHaveLength(1);
    expect(retrieved.experiences[0].partner_name).toBe('Resort Campestre');
  });

  it('debe retornar defaults si el contenido de localStorage está corrupto o es inválido', () => {
    localStorage.setItem(PRIZE_CACHE_KEY, '{invalid json');

    const retrieved = getCachedPrizeDetails();

    expect(retrieved.settings.id).toBe('main');
    expect(retrieved.experiences).toHaveLength(DEFAULT_PRIZE_EXPERIENCES.length);
  });

  it('debe incluir la configuración del Banner Verde Oficial con sus 8 especificaciones por defecto', () => {
    const data = getCachedPrizeDetails();

    expect(data.settings.official_tour_badge).toBe('PREMIO MAYOR OFICIAL');
    expect(data.settings.official_tour_title).toBe('Tour Vive Manaure • 3 Días y 2 Noches');
    expect(data.settings.official_tour_subtitle).toContain('Todo incluido para la pareja (2 personas)');
    expect(Array.isArray(data.settings.official_tour_features)).toBe(true);
    expect(data.settings.official_tour_features).toHaveLength(8);

    const firstFeature = (data.settings.official_tour_features as any[])[0];
    expect(firstFeature.title).toBe('Viaje ida y vuelta pago:');
  });

  it('la experiencia gastronómica debe apuntar al slug oficial de La Casa de las Arepas', () => {
    const gastro = DEFAULT_PRIZE_EXPERIENCES.find((exp) => exp.id === 'exp-gastronomia');
    expect(gastro).toBeDefined();
    expect(gastro?.image_slug).toBe('gastronomia-casa-arepas');
  });
});


