import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de cloudinaryService
vi.mock('@/services/cloudinaryService', () => ({
  uploadToCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn(),
}));

import { uploadToCloudinary } from '@/services/cloudinaryService';
import { uploadPrizeImage } from '@/services/prizeService';
import { uploadPartnerLogo } from '@/services/partnerService';
import { uploadWinnerActDocument } from '@/services/winnerService';

describe('Migración de Subidas a Cloudinary - prizeService & partnerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPrizeImage', () => {
    it('debe rechazar formatos no permitidos (ej: application/pdf, image/gif)', async () => {
      const pdfFile = new File(['%PDF'], 'documento.pdf', { type: 'application/pdf' });
      const res = await uploadPrizeImage(pdfFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato inválido');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe rechazar archivos que superen los 5 MB', async () => {
      const largeFile = new File(['a'], 'foto-gigante.png', { type: 'image/png' });
      Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 });

      const res = await uploadPrizeImage(largeFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('supera el tamaño máximo permitido de 5 MB');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe subir a la carpeta "manaure-vive/premios" y retornar url y public_id', async () => {
      const validFile = new File(['img-bytes'], 'experiencia.webp', { type: 'image/webp' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/premios/exp_1.webp',
        public_id: 'manaure-vive/premios/exp_1',
      });

      const res = await uploadPrizeImage(validFile, 'cuatrimoto');

      expect(uploadToCloudinary).toHaveBeenCalledWith(
        validFile,
        'manaure-vive/premios',
        { resourceType: 'image' }
      );
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/premios/exp_1.webp');
      expect(res.public_id).toBe('manaure-vive/premios/exp_1');
    });

    it('debe propagar errores devueltos por uploadToCloudinary', async () => {
      const validFile = new File(['img-bytes'], 'experiencia.jpg', { type: 'image/jpeg' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: false,
        error: 'Error de autenticación en Cloudinary',
      });

      const res = await uploadPrizeImage(validFile);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Error de autenticación en Cloudinary');
    });
  });

  describe('uploadPartnerLogo', () => {
    it('debe rechazar formatos no permitidos (ej: text/plain)', async () => {
      const textFile = new File(['hello'], 'logo.txt', { type: 'text/plain' });
      const res = await uploadPartnerLogo(textFile, 'mi-aliado');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato inválido');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe aceptar imágenes vectoriales SVG además de PNG/WebP/JPG', async () => {
      const svgFile = new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/aliados/logo_1.svg',
        public_id: 'manaure-vive/aliados/logo_1',
      });

      const res = await uploadPartnerLogo(svgFile, 'aliado-vector');

      expect(uploadToCloudinary).toHaveBeenCalledWith(
        svgFile,
        'manaure-vive/aliados',
        { resourceType: 'auto' }
      );
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/aliados/logo_1.svg');
      expect(res.public_id).toBe('manaure-vive/aliados/logo_1');
    });

    it('debe rechazar logos que superen los 5 MB', async () => {
      const largeLogo = new File(['a'], 'logo-pesado.png', { type: 'image/png' });
      Object.defineProperty(largeLogo, 'size', { value: 5.5 * 1024 * 1024 });

      const res = await uploadPartnerLogo(largeLogo, 'empresa');

      expect(res.success).toBe(false);
      expect(res.error).toContain('supera el tamaño máximo permitido de 5 MB');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe subir a la carpeta "manaure-vive/aliados" con resourceType auto', async () => {
      const pngFile = new File(['png-data'], 'empresa.png', { type: 'image/png' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/aliados/empresa_123.png',
        public_id: 'manaure-vive/aliados/empresa_123',
      });

      const res = await uploadPartnerLogo(pngFile, 'empresa-turismo');

      expect(uploadToCloudinary).toHaveBeenCalledWith(
        pngFile,
        'manaure-vive/aliados',
        { resourceType: 'auto' }
      );
      expect(res.success).toBe(true);
      expect(res.url).toBe('https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/aliados/empresa_123.png');
      expect(res.public_id).toBe('manaure-vive/aliados/empresa_123');
    });
  });

  describe('uploadWinnerActDocument', () => {
    it('debe rechazar archivos que no sean PDF (ej: image/png, text/plain)', async () => {
      const imgFile = new File(['fake-png'], 'acta.png', { type: 'image/png' });
      const res = await uploadWinnerActDocument(imgFile, 'raffle-123');

      expect(res.success).toBe(false);
      expect(res.error).toContain('formato PDF');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe rechazar actas PDF que excedan los 10 MB', async () => {
      const largePdf = new File(['%PDF'], 'acta-pesada.pdf', { type: 'application/pdf' });
      Object.defineProperty(largePdf, 'size', { value: 11 * 1024 * 1024 });

      const res = await uploadWinnerActDocument(largePdf, 'raffle-123');

      expect(res.success).toBe(false);
      expect(res.error).toContain('no debe exceder 10 MB');
      expect(uploadToCloudinary).not.toHaveBeenCalled();
    });

    it('debe subir el acta PDF a "manaure-vive/actas-ganadores" con resourceType auto', async () => {
      const validPdf = new File(['%PDF-1.4'], 'acta_notarial.pdf', { type: 'application/pdf' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/auto/upload/v1/manaure-vive/actas-ganadores/acta_notarial.pdf',
        public_id: 'manaure-vive/actas-ganadores/acta_notarial',
      });

      const res = await uploadWinnerActDocument(validPdf, 'raffle-123');

      expect(uploadToCloudinary).toHaveBeenCalledWith(
        validPdf,
        'manaure-vive/actas-ganadores',
        { resourceType: 'auto' }
      );
      expect(res.success).toBe(true);
      expect(res.url).toBe(
        'https://res.cloudinary.com/ky01b0vz/auto/upload/v1/manaure-vive/actas-ganadores/acta_notarial.pdf'
      );
      expect(res.public_id).toBe('manaure-vive/actas-ganadores/acta_notarial');
    });

    it('debe propagar errores de fallo en la subida a Cloudinary', async () => {
      const validPdf = new File(['%PDF-1.4'], 'acta.pdf', { type: 'application/pdf' });

      vi.mocked(uploadToCloudinary).mockResolvedValue({
        success: false,
        error: 'Error de permisos en Cloudinary',
      });

      const res = await uploadWinnerActDocument(validPdf);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Error de permisos en Cloudinary');
    });
  });
});

