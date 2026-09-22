import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedGalleryItems,
  setCachedGalleryItems,
  getPublicGalleryItems,
  getAdminGalleryItems,
  createGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  toggleGalleryItemActive,
  reorderGalleryItems,
  uploadGalleryPhoto,
  GALLERY_CACHE_KEY,
  GALLERY_CACHE_VERSION,
  FALLBACK_GALLERY_ITEMS,
} from '@/services/galleryService';
import type { GalleryItemRow } from '@/types/raffle.types';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';

describe('galleryService - Gestión Integral de la Galería Fotográfica', () => {
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

  it('debe devolver FALLBACK_GALLERY_ITEMS si la caché de localStorage está vacía', () => {
    const data = getCachedGalleryItems();
    expect(data).toBeDefined();
    expect(data).toHaveLength(18);
    expect(data[0].id).toBe('hospedaje-villa-adelaida');
    expect(data[0].category).toBe('hospedaje');
    expect(data[2].category).toBe('cuatrimoto');
    expect(data[6].category).toBe('parapente');
  });

  it('debe almacenar y recuperar los datos en caché con versión correcta', () => {
    const customItems: GalleryItemRow[] = [
      {
        id: 'foto-1',
        raffle_id: null,
        title: 'Foto Test 1',
        category: 'serrania',
        image_slug: 'serrania-topiarios',
        image_url: null,
        alt_text: 'Alt test',
        display_order: 1,
        is_active: true,
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
    ];

    setCachedGalleryItems(customItems);
    expect(store[GALLERY_CACHE_KEY]).toBeDefined();
    const parsed = JSON.parse(store[GALLERY_CACHE_KEY]);
    expect(parsed.version).toBe(GALLERY_CACHE_VERSION);

    const retrieved = getCachedGalleryItems();
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].title).toBe('Foto Test 1');
  });

  it('debe ignorar datos corruptos en caché y usar FALLBACK_GALLERY_ITEMS', () => {
    store[GALLERY_CACHE_KEY] = JSON.stringify({
      version: 999, // Versión no coincidente
      data: [{ title: 'Invalido' }],
    });

    const retrieved = getCachedGalleryItems();
    expect(retrieved).toHaveLength(FALLBACK_GALLERY_ITEMS.length);
    expect(retrieved[0].id).toBe(FALLBACK_GALLERY_ITEMS[0].id);
  });

  it('debe consultar Supabase y actualizar la caché cuando la consulta pública es exitosa', async () => {
    const mockDbData: GalleryItemRow[] = [
      {
        id: 'db-1',
        raffle_id: null,
        title: 'Foto Remota 1',
        category: 'cuatrimoto',
        image_slug: 'cuatrimoto-ruta',
        image_url: null,
        alt_text: 'Alt remota',
        display_order: 1,
        is_active: true,
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
    ];

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockDbData, error: null }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const result = await getPublicGalleryItems();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Foto Remota 1');
    expect(store[GALLERY_CACHE_KEY]).toBeDefined();
  });

  it('debe hacer fallback silencioso a la caché si Supabase falla en getPublicGalleryItems', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Could not find the table 'public.gallery_items'" },
      }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const result = await getPublicGalleryItems();

    expect(result).toBeDefined();
    expect(result).toHaveLength(18); // Fallback canónico sin romper UI
  });

  it('debe consultar todas las fotos en getAdminGalleryItems', async () => {
    const mockItems: GalleryItemRow[] = [
      {
        id: '1',
        raffle_id: null,
        title: 'Foto 1',
        category: 'fogata',
        image_slug: 'fogata-casa-de-vidrio',
        image_url: null,
        alt_text: 'Alt 1',
        display_order: 1,
        is_active: true,
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
      {
        id: '2',
        raffle_id: null,
        title: 'Foto 2 (Oculta)',
        category: 'serrania',
        image_slug: 'serrania-topiarios',
        image_url: null,
        alt_text: 'Alt 2',
        display_order: 2,
        is_active: false,
        created_at: '2026-09-21T00:00:00Z',
        updated_at: '2026-09-21T00:00:00Z',
      },
    ];

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const res = await getAdminGalleryItems();
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(2);
  });

  it('debe validar que el título no esté vacío al crear una foto', async () => {
    const res = await createGalleryItem({
      title: '   ',
      image_slug: 'cuatrimoto-ruta',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('El título de la fotografía es obligatorio');
  });

  it('debe validar que se proporcione al menos una imagen (slug o url) al crear una foto', async () => {
    const res = await createGalleryItem({
      title: 'Título válido',
      image_slug: null,
      image_url: null,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Debes seleccionar una foto del catálogo local o subir una fotografía');
  });

  it('debe crear exitosamente una fotografía asignando display_order', async () => {
    const mockInserted: GalleryItemRow = {
      id: 'new-id',
      raffle_id: null,
      title: 'Nueva Foto Aventura',
      category: 'cuatrimoto',
      image_slug: 'cuatrimoto-aventura-cordillera',
      image_url: null,
      alt_text: 'Nueva Foto Aventura',
      display_order: 19,
      is_active: true,
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
    };

    // Primero simula la consulta de max(display_order)
    const mockOrderQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { display_order: 18 }, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockOrderQuery as any);

    const res = await createGalleryItem({
      title: 'Nueva Foto Aventura',
      category: 'cuatrimoto',
      image_slug: 'cuatrimoto-aventura-cordillera',
    });

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe('new-id');
  });

  it('debe actualizar campos de una fotografía existente', async () => {
    const mockUpdated: GalleryItemRow = {
      id: 'item-1',
      raffle_id: null,
      title: 'Título Modificado',
      category: 'parapente',
      image_slug: 'parapente-vuelo',
      image_url: null,
      alt_text: 'Nuevo Alt',
      display_order: 1,
      is_active: true,
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T01:00:00Z',
    };

    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const res = await updateGalleryItem('item-1', {
      title: 'Título Modificado',
      category: 'parapente',
      alt_text: 'Nuevo Alt',
    });

    expect(res.success).toBe(true);
    expect(res.data?.title).toBe('Título Modificado');
    expect(res.data?.category).toBe('parapente');
  });

  it('debe eliminar una fotografía y borrar su archivo físico en Storage si aplica', async () => {
    const mockRemove = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockStorage = {
      remove: mockRemove,
    };
    vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as any);

    const mockDeleteQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockDeleteQuery as any);

    const res = await deleteGalleryItem(
      'item-storage-1',
      'https://xyz.supabase.co/storage/v1/object/public/gallery-images/foto-subida-123.webp'
    );

    expect(res.success).toBe(true);
    expect(supabase.storage.from).toHaveBeenCalledWith('gallery-images');
    expect(mockRemove).toHaveBeenCalledWith(['foto-subida-123.webp']);
  });

  it('debe alternar la visibilidad de una foto en toggleGalleryItemActive', async () => {
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const res = await toggleGalleryItemActive('item-1', false);
    expect(res.success).toBe(true);
  });

  it('debe reordenar fotografías en lote', async () => {
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

    const res = await reorderGalleryItems([
      { id: '1', display_order: 1 },
      { id: '2', display_order: 2 },
    ]);

    expect(res.success).toBe(true);
  });

  it('debe rechazar archivos con formato no soportado en uploadGalleryPhoto', async () => {
    const fakeFile = new File(['dummy'], 'documento.pdf', { type: 'application/pdf' });
    const res = await uploadGalleryPhoto(fakeFile);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Formato inválido');
  });

  it('debe subir una foto válida y retornar la URL pública en uploadGalleryPhoto', async () => {
    const fakeFile = new File(['fake-image-bytes'], 'paisaje.webp', { type: 'image/webp' });

    const mockUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mockGetPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://xyz.supabase.co/storage/v1/object/public/gallery-images/galeria-123.webp' },
    });

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    } as any);

    const res = await uploadGalleryPhoto(fakeFile, 'parapente');

    expect(res.success).toBe(true);
    expect(res.url).toBe('https://xyz.supabase.co/storage/v1/object/public/gallery-images/galeria-123.webp');
  });
});

