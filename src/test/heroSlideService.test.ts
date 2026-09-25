import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedHeroSlides,
  setCachedHeroSlides,
  clearHeroSlidesCache,
  getPublicHeroSlides,
  getAdminHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  toggleHeroSlideActive,
  reorderHeroSlides,
  uploadHeroPhoto,
  FALLBACK_HERO_SLIDES,
  HERO_SLIDES_CACHE_KEY,
} from '@/services/heroSlideService';
import type { HeroSlideRow } from '@/types/raffle.types';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock de cloudinaryService
vi.mock('@/services/cloudinaryService', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn(),
  extractCloudinaryPublicId: vi.fn((url: string) => {
    if (!url) return null;
    if (url.includes('manaure-vive/galeria/hero/test-img')) {
      return 'manaure-vive/galeria/hero/test-img';
    }
    return null;
  }),
  getCloudinaryResponsiveUrl: vi.fn((url: string) => url),
  getOptimizedCloudinaryUrl: vi.fn((url: string) => url),
}));

import { supabase } from '@/lib/supabase';
import { uploadToCloudinary, deleteFromCloudinary } from '@/services/cloudinaryService';

describe('heroSlideService - Gestión del Carrusel de Fondos del Hero', () => {
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

  describe('Caché Local de Diapositivas', () => {
    it('debe almacenar y recuperar diapositivas válidas de la caché', () => {
      const mockSlides: HeroSlideRow[] = [
        {
          id: 'slide-1',
          title: 'Serranía Test',
          image_url: 'https://example.com/img1.jpg',
          image_slug: 'serrania',
          alt_text: 'Alt 1',
          display_order: 1,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      setCachedHeroSlides(mockSlides);
      const cached = getCachedHeroSlides();
      expect(cached).toEqual(mockSlides);
    });

    it('debe limpiar la caché correctamente con clearHeroSlidesCache', () => {
      setCachedHeroSlides(FALLBACK_HERO_SLIDES);
      clearHeroSlidesCache();
      expect(getCachedHeroSlides()).toBeNull();
    });

    it('debe ignorar caché si el payload tiene versión incorrecta o está corrupto', () => {
      localStorage.setItem(
        HERO_SLIDES_CACHE_KEY,
        JSON.stringify({ version: 999, timestamp: Date.now(), data: [] })
      );
      expect(getCachedHeroSlides()).toBeNull();
    });
  });

  describe('getPublicHeroSlides - Consulta Pública Resiliente', () => {
    it('debe retornar datos de Supabase si la consulta es exitosa', async () => {
      const mockDbSlides: HeroSlideRow[] = [
        {
          id: 'slide-10',
          title: 'Foto Desde Supabase',
          image_url: 'https://res.cloudinary.com/test.jpg',
          image_slug: null,
          alt_text: 'Foto Supabase',
          display_order: 1,
          is_active: true,
          created_at: '2026-09-25T00:00:00Z',
          updated_at: '2026-09-25T00:00:00Z',
        },
      ];

      const selectMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({ data: mockDbSlides, error: null });

      (supabase.from as any).mockReturnValue({
        select: selectMock,
        eq: eqMock,
        order: orderMock,
      });

      const result = await getPublicHeroSlides();
      expect(result).toEqual(mockDbSlides);
      expect(getCachedHeroSlides()).toEqual(mockDbSlides);
    });

    it('debe caer a FALLBACK_HERO_SLIDES si Supabase devuelve error y no hay caché previa', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database unreachable' } }),
      });

      const result = await getPublicHeroSlides();
      expect(result).toEqual(FALLBACK_HERO_SLIDES);
    });
  });

  describe('getAdminHeroSlides - Consulta Administrativa', () => {
    it('debe retornar todas las diapositivas ordenadas por display_order', async () => {
      const mockList: HeroSlideRow[] = [
        {
          id: 'slide-1',
          title: 'Admin Slide 1',
          image_url: 'https://img.com/1.jpg',
          image_slug: null,
          alt_text: 'Admin',
          display_order: 1,
          is_active: true,
          created_at: '2026-09-25T00:00:00Z',
          updated_at: '2026-09-25T00:00:00Z',
        },
      ];

      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockList, error: null }),
      });

      const res = await getAdminHeroSlides();
      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockList);
    });
  });

  describe('createHeroSlide - Creación de Diapositiva', () => {
    it('debe validar que el título y la URL sean obligatorios', async () => {
      const resSinTitulo = await createHeroSlide({ title: '', image_url: 'https://test.com/img.jpg' });
      expect(resSinTitulo.success).toBe(false);
      expect(resSinTitulo.error).toContain('título');

      const resSinUrl = await createHeroSlide({ title: 'Vuelo', image_url: '' });
      expect(resSinUrl.success).toBe(false);
      expect(resSinUrl.error).toContain('fotografía');
    });

    it('debe insertar la diapositiva e invalidar la caché', async () => {
      setCachedHeroSlides(FALLBACK_HERO_SLIDES);

      const createdRow: HeroSlideRow = {
        id: 'new-id-123',
        title: 'Nueva Aventura',
        image_url: 'https://res.cloudinary.com/ky01b0vz/new.jpg',
        image_slug: null,
        alt_text: 'Nueva Aventura',
        display_order: 5,
        is_active: true,
        created_at: '2026-09-25T00:00:00Z',
        updated_at: '2026-09-25T00:00:00Z',
      };

      (supabase.from as any).mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: createdRow, error: null }),
      });

      const res = await createHeroSlide({
        title: 'Nueva Aventura',
        image_url: 'https://res.cloudinary.com/ky01b0vz/new.jpg',
        display_order: 5,
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toBe('new-id-123');
      expect(getCachedHeroSlides()).toBeNull();
    });
  });

  describe('updateHeroSlide y toggleHeroSlideActive', () => {
    it('debe actualizar campos de la diapositiva e invalidar caché', async () => {
      setCachedHeroSlides(FALLBACK_HERO_SLIDES);

      const updatedRow: HeroSlideRow = {
        ...FALLBACK_HERO_SLIDES[0],
        title: 'Serranía Actualizada',
      };

      (supabase.from as any).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      });

      const res = await updateHeroSlide('fallback-hero-1', { title: 'Serranía Actualizada' });
      expect(res.success).toBe(true);
      expect(res.data?.title).toBe('Serranía Actualizada');
      expect(getCachedHeroSlides()).toBeNull();
    });

    it('toggleHeroSlideActive debe alternar el estado activo correctamente', async () => {
      const updatedRow: HeroSlideRow = {
        ...FALLBACK_HERO_SLIDES[0],
        is_active: false,
      };

      (supabase.from as any).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      });

      const res = await toggleHeroSlideActive('fallback-hero-1', false);
      expect(res.success).toBe(true);
    });
  });

  describe('reorderHeroSlides - Reordenamiento Secuencial', () => {
    it('debe reordenar las diapositivas y limpiar caché', async () => {
      setCachedHeroSlides(FALLBACK_HERO_SLIDES);

      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockReturnValue({
        update: updateMock,
        eq: eqMock,
      });

      const res = await reorderHeroSlides([
        { id: 'slide-1', display_order: 2 },
        { id: 'slide-2', display_order: 1 },
      ]);

      expect(res.success).toBe(true);
      expect(getCachedHeroSlides()).toBeNull();
    });
  });

  describe('deleteHeroSlide - Eliminación con Limpieza en Cloudinary', () => {
    it('debe intentar destruir en Cloudinary si la imagen está en manaure-vive/galeria/hero', async () => {
      (supabase.from as any).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (deleteFromCloudinary as any).mockResolvedValue({ success: true });

      const res = await deleteHeroSlide(
        'hero-del-1',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/galeria/hero/test-img.jpg'
      );

      expect(res.success).toBe(true);
      expect(deleteFromCloudinary).toHaveBeenCalledWith('manaure-vive/galeria/hero/test-img');
    });

    it('no debe destruir en Cloudinary si es una foto canónica de otra categoría', async () => {
      (supabase.from as any).mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const res = await deleteHeroSlide(
        'hero-del-2',
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/galeria/serrania/og-image.jpg'
      );

      expect(res.success).toBe(true);
      expect(deleteFromCloudinary).not.toHaveBeenCalled();
    });
  });

  describe('uploadHeroPhoto - Subida Profesional a Cloudinary', () => {
    it('debe rechazar formatos no permitidos como gif o pdf', async () => {
      const fakePdf = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
      const res = await uploadHeroPhoto(fakePdf);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato no compatible');
    });

    it('debe llamar a uploadToCloudinary con la carpeta manaure-vive/galeria/hero', async () => {
      const validFile = new File(['image-bytes'], 'hero-banner.jpg', { type: 'image/jpeg' });
      (uploadToCloudinary as any).mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/hero-banner.webp',
        public_id: 'manaure-vive/galeria/hero/hero-banner',
      });

      const res = await uploadHeroPhoto(validFile);
      expect(res.success).toBe(true);
      expect(uploadToCloudinary).toHaveBeenCalledWith(validFile, 'manaure-vive/galeria/hero');
    });
  });
});
