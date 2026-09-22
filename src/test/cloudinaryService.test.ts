import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  getOptimizedCloudinaryUrl,
  extractCloudinaryPublicId,
} from '@/services/cloudinaryService';

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

  describe('getOptimizedCloudinaryUrl', () => {
    it('debe devolver cadena vacía para entradas vacías o nulas', () => {
      expect(getOptimizedCloudinaryUrl(null)).toBe('');
      expect(getOptimizedCloudinaryUrl(undefined)).toBe('');
      expect(getOptimizedCloudinaryUrl('   ')).toBe('');
    });

    it('debe preservar intactas las URLs que no pertenezcan a Cloudinary (Supabase Storage, rutas locales)', () => {
      const supabaseUrl =
        'https://bxhzvmbbsisxqpwrgvgn.supabase.co/storage/v1/object/public/prize-images/premio-123.jpg';
      expect(getOptimizedCloudinaryUrl(supabaseUrl)).toBe(supabaseUrl);

      const localPath = '/images/rifa/cuatrimoto/cuatrimoto-aventura-cordillera--4x5-768w.jpg';
      expect(getOptimizedCloudinaryUrl(localPath)).toBe(localPath);

      const externalUrl = 'https://images.unsplash.com/photo-123456';
      expect(getOptimizedCloudinaryUrl(externalUrl)).toBe(externalUrl);
    });

    it('debe inyectar transformaciones f_auto y q_auto en URLs estándar de Cloudinary', () => {
      const cloudUrl =
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790092061/manaure-vive/premios/exp_1.webp';
      const optimized = getOptimizedCloudinaryUrl(cloudUrl);

      expect(optimized).toBe(
        'https://res.cloudinary.com/ky01b0vz/image/upload/f_auto,q_auto/v1790092061/manaure-vive/premios/exp_1.webp'
      );
    });

    it('debe incluir ancho opcional cuando se proporcione', () => {
      const cloudUrl =
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790092061/manaure-vive/aliados/logo_1.png';
      const optimized = getOptimizedCloudinaryUrl(cloudUrl, { width: 300 });

      expect(optimized).toBe(
        'https://res.cloudinary.com/ky01b0vz/image/upload/f_auto,q_auto,w_300/v1790092061/manaure-vive/aliados/logo_1.png'
      );
    });

    it('no debe duplicar transformaciones si la URL ya posee f_auto', () => {
      const alreadyOptimized =
        'https://res.cloudinary.com/ky01b0vz/image/upload/f_auto,q_auto,w_400/v1790092061/manaure-vive/premios/exp_1.webp';
      expect(getOptimizedCloudinaryUrl(alreadyOptimized)).toBe(alreadyOptimized);
    });

    it('debe respetar y preservar URLs firmadas criptográficamente de Cloudinary', () => {
      const signedUrl =
        'https://res.cloudinary.com/ky01b0vz/image/upload/s--AbCdEf12--/v1790092061/manaure-vive/premios/privado.jpg';
      expect(getOptimizedCloudinaryUrl(signedUrl)).toBe(signedUrl);
    });

    it('no debe transformar documentos PDF ni URLs raw', () => {
      const pdfUrl =
        'https://res.cloudinary.com/ky01b0vz/auto/upload/v1790092061/manaure-vive/actas-ganadores/acta_sorteo.pdf';
      expect(getOptimizedCloudinaryUrl(pdfUrl)).toBe(pdfUrl);

      const rawUrl =
        'https://res.cloudinary.com/ky01b0vz/raw/upload/v1790092061/manaure-vive/documento.txt';
      expect(getOptimizedCloudinaryUrl(rawUrl)).toBe(rawUrl);
    });
  });

  describe('extractCloudinaryPublicId', () => {
    it('debe retornar null si la entrada es nula, vacía o no válida', () => {
      expect(extractCloudinaryPublicId(null)).toBeNull();
      expect(extractCloudinaryPublicId(undefined)).toBeNull();
      expect(extractCloudinaryPublicId('   ')).toBeNull();
      expect(extractCloudinaryPublicId('https://supabase.co/storage/v1/object/public/test.jpg')).toBeNull();
    });

    it('debe extraer el public_id de una URL estándar de Cloudinary con versión', () => {
      const url =
        'https://res.cloudinary.com/ky01b0vz/image/upload/v1790099148/manaure-vive/aliados/photours.png';
      expect(extractCloudinaryPublicId(url)).toBe('manaure-vive/aliados/photours');
    });

    it('debe extraer el public_id de una URL transformada con f_auto, q_auto y ancho', () => {
      const url =
        'https://res.cloudinary.com/ky01b0vz/image/upload/f_auto,q_auto,w_200/v1790099148/manaure-vive/aliados/photours.png';
      expect(extractCloudinaryPublicId(url)).toBe('manaure-vive/aliados/photours');
    });

    it('debe extraer el public_id de una URL sin versión', () => {
      const url =
        'https://res.cloudinary.com/ky01b0vz/image/upload/manaure-vive/aliados/photours.png';
      expect(extractCloudinaryPublicId(url)).toBe('manaure-vive/aliados/photours');
    });

    it('debe admitir identificadores que ya son un public_id directo', () => {
      expect(extractCloudinaryPublicId('manaure-vive/aliados/photours.png')).toBe(
        'manaure-vive/aliados/photours'
      );
      expect(extractCloudinaryPublicId('manaure-vive/aliados/photours')).toBe(
        'manaure-vive/aliados/photours'
      );
    });
  });
});

