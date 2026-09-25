import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as galleryService from '../services/galleryService';
import * as paymentService from '../services/paymentService';
import * as cloudinaryService from '../services/cloudinaryService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación SEC-05
 * Hardening Controlado de Supabase Storage: Erradicación de Subida Anónima en receipts
 * y Eliminación de image/svg+xml como Vector de Stored XSS en gallery-images.
 */

describe('SEC-05: Hardening Controlado de Supabase Storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Hardening de galleryService y erradicación de SVG', () => {
    it('uploadGalleryPhoto debe rechazar taxativamente archivos SVG (image/svg+xml)', async () => {
      const svgFile = new File(['<svg><script>alert(1)</script></svg>'], 'vector.svg', {
        type: 'image/svg+xml',
      });

      const res = await galleryService.uploadGalleryPhoto(svgFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato inválido');
    });

    it('uploadGalleryPhoto debe rechazar archivos ejecutables o scripts', async () => {
      const exeFile = new File(['MZ'], 'malware.exe', {
        type: 'application/x-msdownload',
      });

      const res = await galleryService.uploadGalleryPhoto(exeFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato inválido');
    });

    it('uploadGalleryPhoto debe rechazar imágenes que superen la cuota de 10 MB', async () => {
      // Archivo simulado de 11 MB
      const hugeFile = {
        name: 'huge.jpg',
        type: 'image/jpeg',
        size: 11 * 1024 * 1024,
      } as unknown as File;

      const res = await galleryService.uploadGalleryPhoto(hugeFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('supera el límite recomendado de 10 MB');
    });

    it('uploadGalleryPhoto debe aceptar formatos fotográficos válidos (WebP, JPEG, PNG, AVIF)', async () => {
      const uploadSpy = vi.spyOn(cloudinaryService, 'uploadToCloudinary').mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/galeria/foto.webp',
        public_id: 'manaure-vive/galeria/foto',
      });

      const validFile = new File(['dummy_image_data'], 'paisaje.webp', {
        type: 'image/webp',
      });

      const res = await galleryService.uploadGalleryPhoto(validFile);

      expect(res.success).toBe(true);
      expect(uploadSpy).toHaveBeenCalledWith(validFile, 'manaure-vive/galeria', {
        resourceType: 'image',
      });
      expect(res.url).toContain('manaure-vive/galeria/foto.webp');
    });
  });

  describe('2. Hardening de paymentService y comprobantes', () => {
    it('uploadPaymentProof debe subir exclusivamente al bucket privado payment-proofs y nunca a receipts', async () => {
      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ error: null }),
      };
      const storageSpy = vi.spyOn(supabase.storage, 'from').mockReturnValue(mockStorage as any);
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: { success: true, proof_id: 'proof-uuid-1' },
        error: null,
      } as any);

      const validProof = new File(['dummy_proof'], 'comprobante.jpg', {
        type: 'image/jpeg',
      });

      const res = await paymentService.uploadPaymentProof(
        validProof,
        'order-uuid-123',
        'raffle-uuid-456',
        'buyer-uuid-789'
      );

      expect(storageSpy).toHaveBeenCalledWith('payment-proofs');
      expect(storageSpy).not.toHaveBeenCalledWith('receipts');
      expect(res.success).toBe(true);
    });

    it('uploadPaymentProof debe rechazar archivos mayores a 5 MB', async () => {
      const hugeFile = {
        name: 'comprobante_gigante.pdf',
        type: 'application/pdf',
        size: 6 * 1024 * 1024,
      } as unknown as File;

      const res = await paymentService.uploadPaymentProof(
        hugeFile,
        'order-uuid-123',
        'raffle-uuid-456',
        'buyer-uuid-789'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('5 MB');
    });

    it('getSignedProofUrl debe intentar crear URL firmada en payment-proofs', async () => {
      const mockStorage = {
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://xyz.supabase.co/storage/v1/object/sign/payment-proofs/proof.jpg?token=secret' },
          error: null,
        }),
      };
      const storageSpy = vi.spyOn(supabase.storage, 'from').mockReturnValue(mockStorage as any);

      const res = await paymentService.getSignedProofUrl('proofs/raffle/order/file.jpg');

      expect(storageSpy).toHaveBeenCalledWith('payment-proofs');
      expect(mockStorage.createSignedUrl).toHaveBeenCalledTimes(1);
      expect(res.url).toContain('token=secret');
    });
  });
});

