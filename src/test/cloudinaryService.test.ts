import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadToCloudinary, deleteFromCloudinary } from '@/services/cloudinaryService';

// Mock de Supabase
vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
      },
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

import { supabase } from '@/lib/supabase';

describe('cloudinaryService - Integración Segura con Cloudinary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('uploadToCloudinary', () => {
    it('debe rechazar la subida si no se proporciona ningún archivo', async () => {
      // @ts-expect-error probando valor nulo intencional
      const result = await uploadToCloudinary(null, 'manaure-vive/premios');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No se suministró ningún archivo');
    });

    it('debe rechazar la subida si la carpeta está vacía', async () => {
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      const result = await uploadToCloudinary(file, '   ');
      expect(result.success).toBe(false);
      expect(result.error).toContain('carpeta de destino válida');
    });

    it('debe manejar error cuando la Edge Function no autoriza o falla la firma', async () => {
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'fake-token' } as any },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { error: 'El usuario autenticado no posee privilegios de administrador.' } as any,
        error: new Error('FunctionsFetchError'),
      });

      const result = await uploadToCloudinary(file, 'manaure-vive/premios');
      expect(result.success).toBe(false);
      expect(result.error).toContain('El usuario autenticado no posee privilegios de administrador.');
    });

    it('debe subir exitosamente a Cloudinary con los parámetros firmados', async () => {
      const file = new File(['image-content'], 'premio-1.jpg', { type: 'image/jpeg' });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'admin-jwt-token' } as any },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          action: 'upload',
          signature: 'sha1-mocked-signature',
          timestamp: 1790000000,
          folder: 'manaure-vive/premios',
          api_key: '123456789',
          cloud_name: 'test-cloud',
        } as any,
        error: null,
      });

      // Mock de fetch global para la llamada a Cloudinary API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          public_id: 'manaure-vive/premios/premio_xyz123',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/manaure-vive/premios/premio_xyz123.jpg',
          format: 'jpg',
          bytes: 1024,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await uploadToCloudinary(file, 'manaure-vive/premios');

      expect(result.success).toBe(true);
      expect(result.secure_url).toBe(
        'https://res.cloudinary.com/test-cloud/image/upload/v1/manaure-vive/premios/premio_xyz123.jpg'
      );
      expect(result.public_id).toBe('manaure-vive/premios/premio_xyz123');

      // Verificar que fetch fue llamado con la URL correcta
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('debe soportar resourceType: "auto" para logos vectoriales SVG', async () => {
      const file = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'admin-jwt-token' } as any },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          action: 'upload',
          signature: 'sha1-auto-signature',
          timestamp: 1790000000,
          folder: 'manaure-vive/aliados',
          api_key: '123456789',
          cloud_name: 'test-cloud',
        } as any,
        error: null,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          public_id: 'manaure-vive/aliados/logo_svg_123',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/manaure-vive/aliados/logo_svg_123.svg',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await uploadToCloudinary(file, 'manaure-vive/aliados', { resourceType: 'auto' });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudinary.com/v1_1/test-cloud/auto/upload',
        expect.any(Object)
      );
    });

    it('debe manejar error devuelto por la API de Cloudinary (ej: 400 Bad Request)', async () => {
      const file = new File(['corrupt'], 'bad.png', { type: 'image/png' });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } as any },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          action: 'upload',
          signature: 'sha1-valid',
          timestamp: 1790000000,
          folder: 'manaure-vive/premios',
          api_key: '123456789',
          cloud_name: 'test-cloud',
        } as any,
        error: null,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Invalid image file or corrupted header.' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await uploadToCloudinary(file, 'manaure-vive/premios');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image file or corrupted header.');
    });
  });

  describe('deleteFromCloudinary', () => {
    it('debe rechazar eliminación si no se suministra public_id', async () => {
      const result = await deleteFromCloudinary('   ');
      expect(result.success).toBe(false);
      expect(result.error).toContain('public_id no suministrado');
    });

    it('debe eliminar exitosamente un recurso en Cloudinary', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { access_token: 'token' } as any },
        error: null,
      });

      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: {
          success: true,
          action: 'destroy',
          signature: 'destroy-sig',
          timestamp: 1790000000,
          public_id: 'manaure-vive/premios/premio_xyz123',
          api_key: '123456789',
          cloud_name: 'test-cloud',
        } as any,
        error: null,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: 'ok' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await deleteFromCloudinary('manaure-vive/premios/premio_xyz123');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudinary.com/v1_1/test-cloud/image/destroy',
        expect.any(Object)
      );
    });
  });
});
