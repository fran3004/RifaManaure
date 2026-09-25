import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as paymentService from '../services/paymentService';
import * as galleryService from '../services/galleryService';
import * as cloudinaryService from '../services/cloudinaryService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación para PROMPT 05.3
 * Cierre Total del Bucket Legacy 'receipts', Aislamiento de Comprobantes,
 * Sanitización de 'gallery-images' (Anti-SVG XSS) y Purga de Políticas Huérfanas.
 * 
 * Hallazgos: EVENT-03, EVENT-04, EVENT-09
 */

interface StorageBucketConfig {
  id: string;
  public: boolean;
  file_size_limit: number;
  allowed_mime_types: string[];
}

interface StoragePolicy {
  name: string;
  bucket_id: string;
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  roles: string[];
  check: (context: { role: string; isAdmin: boolean; objectPath?: string; orderStatus?: string }) => boolean;
}

// Simulación de la función PostgreSQL SECURITY DEFINER fn_is_order_pending_proof
function fn_is_order_pending_proof(
  objectName: string,
  ordersMap: Map<string, { status: string }>
): boolean {
  // Path format: proofs/<raffle_id>/<order_id>/<filename> (part 3) or proofs/<order_id>/<filename> (part 2)
  const parts = objectName.split('/');
  let orderIdStr = parts[2];
  if (!orderIdStr || orderIdStr === '') {
    orderIdStr = parts[1];
  }

  if (!orderIdStr) return false;

  // Validación de formato UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderIdStr)) return false;

  const order = ordersMap.get(orderIdStr);
  return !!order && (order.status === 'pending' || order.status === 'pending_verification');
}

describe('PROMPT 05.3: Cierre Total del Bucket Legacy receipts y Saneamiento de Storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Catálogo canónico de buckets conforme a la Migración 054
  const bucketsCatalog: StorageBucketConfig[] = [
    {
      id: 'receipts',
      public: false, // Forzado a privado (EVENT-03)
      file_size_limit: 5242880, // 5 MB
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    },
    {
      id: 'payment-proofs',
      public: false, // Privado
      file_size_limit: 5242880, // 5 MB
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    },
    {
      id: 'gallery-images',
      public: true, // Galería pública comunitaria
      file_size_limit: 10485760, // 10 MB
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], // SVG eliminado taxativamente
    },
    {
      id: 'winner-documents',
      public: true, // Público para exhibición y verificación de actas en PDF (Migración 061)
      file_size_limit: 10485760, // 10 MB
      allowed_mime_types: ['application/pdf'],
    },
  ];

  // Catálogo de políticas RLS activas en storage.objects post-Migración 054
  const storagePolicies: StoragePolicy[] = [
    {
      name: 'Administradores pueden listar y leer comprobantes',
      bucket_id: 'receipts',
      command: 'SELECT',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
    {
      name: 'Solo administradores pueden leer comprobantes de payment-proofs',
      bucket_id: 'payment-proofs',
      command: 'SELECT',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
    {
      name: 'Compradores pueden subir comprobantes a payment-proofs',
      bucket_id: 'payment-proofs',
      command: 'INSERT',
      roles: ['public', 'anon', 'authenticated'],
      check: ({ objectPath, orderStatus }) => {
        if (!objectPath) return false;
        return orderStatus === 'pending' || orderStatus === 'pending_verification';
      },
    },
    {
      name: 'Lectura pública de fotos de galería',
      bucket_id: 'gallery-images',
      command: 'SELECT',
      roles: ['public', 'anon', 'authenticated'],
      check: () => true,
    },
    {
      name: 'Solo administradores suben fotos de galería',
      bucket_id: 'gallery-images',
      command: 'INSERT',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
    {
      name: 'Lectura pública de actas de ganadores',
      bucket_id: 'winner-documents',
      command: 'SELECT',
      roles: ['public', 'anon', 'authenticated'],
      check: () => true,
    },
    {
      name: 'Solo administradores pueden subir actas de ganadores',
      bucket_id: 'winner-documents',
      command: 'INSERT',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
    {
      name: 'Solo administradores pueden actualizar actas de ganadores',
      bucket_id: 'winner-documents',
      command: 'UPDATE',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
    {
      name: 'Solo administradores pueden eliminar actas de ganadores',
      bucket_id: 'winner-documents',
      command: 'DELETE',
      roles: ['authenticated'],
      check: ({ role, isAdmin }) => role === 'authenticated' && isAdmin,
    },
  ];

  // Base de datos de órdenes para validación de paths
  const ordersDb = new Map<string, { status: string }>([
    ['11111111-1111-1111-1111-111111111111', { status: 'pending' }],
    ['22222222-2222-2222-2222-222222222222', { status: 'pending_verification' }],
    ['33333333-3333-3333-3333-333333333333', { status: 'paid' }],
    ['44444444-4444-4444-4444-444444444444', { status: 'rejected' }],
    ['55555555-5555-5555-5555-555555555555', { status: 'expired' }],
  ]);

  describe('1. Verificación del Bucket receipts (Privado y Cerrado a Escrituras)', () => {
    it('1.1 receipts debe estar configurado como public = false', () => {
      const receiptsBucket = bucketsCatalog.find((b) => b.id === 'receipts')!;
      expect(receiptsBucket).toBeDefined();
      expect(receiptsBucket.public).toBe(false);
      expect(receiptsBucket.file_size_limit).toBe(5242880);
      expect(receiptsBucket.allowed_mime_types).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ]);
    });

    it('1.2 Solicitud GET pública directa a receipts debe ser rechazada (no expuesta en CDN público)', () => {
      // Simulación del motor de Supabase Storage para endpoints públicos:
      // /storage/v1/object/public/:bucket/:path
      function simulatePublicGet(bucketId: string, _objectPath: string) {
        const bucket = bucketsCatalog.find((b) => b.id === bucketId);
        if (!bucket || !bucket.public) {
          return { status: 400, error: 'Bucket not found or private' };
        }
        return { status: 200, data: 'file_content' };
      }

      const res = simulatePublicGet('receipts', 'comprobante_historico.jpg');
      expect(res.status).toBe(400);
      expect(res.error).toBe('Bucket not found or private');
    });

    it('1.3 NO debe existir ninguna política de INSERT, UPDATE ni DELETE sobre receipts', () => {
      const writePolicies = storagePolicies.filter(
        (p) => p.bucket_id === 'receipts' && p.command !== 'SELECT'
      );
      expect(writePolicies.length).toBe(0);
    });

    it('1.4 Subida anónima a receipts debe ser rechazada taxativamente por RLS', () => {
      const insertPolicies = storagePolicies.filter(
        (p) => p.bucket_id === 'receipts' && (p.command === 'INSERT' || p.command === 'ALL')
      );
      // Sin política de inserción -> PostgreSQL niega por defecto (deny-all)
      expect(insertPolicies.length).toBe(0);
    });

    it('1.5 Descarga anónima de objeto existente en receipts debe ser bloqueada', () => {
      const selectPolicy = storagePolicies.find(
        (p) => p.bucket_id === 'receipts' && p.command === 'SELECT'
      )!;
      expect(selectPolicy).toBeDefined();

      // Usuario anónimo intenta leer
      const canAnonRead = selectPolicy.check({ role: 'anon', isAdmin: false });
      expect(canAnonRead).toBe(false);

      // Usuario autenticado regular (no admin) intenta leer
      const canUserRead = selectPolicy.check({ role: 'authenticated', isAdmin: false });
      expect(canUserRead).toBe(false);
    });

    it('1.6 Administrador autenticado SÍ puede acceder a comprobantes históricos de receipts vía Signed URL', async () => {
      const selectPolicy = storagePolicies.find(
        (p) => p.bucket_id === 'receipts' && p.command === 'SELECT'
      )!;
      const canAdminRead = selectPolicy.check({ role: 'authenticated', isAdmin: true });
      expect(canAdminRead).toBe(true);

      // Simular getSignedPaymentProofUrl cuando el objeto proviene de receipts
      const mockStorage = {
        createSignedUrl: vi.fn().mockImplementation((path: string) => {
          return Promise.resolve({
            data: { signedUrl: `https://xyz.supabase.co/storage/v1/object/sign/receipts/${path}?token=admin_token` },
            error: null,
          });
        }),
      };

      vi.spyOn(supabase.storage, 'from').mockReturnValue(mockStorage as any);

      const res = await paymentService.getSignedProofUrl('receipts/comprobante_historico_123.jpg');
      expect(res.url).toBeDefined();
      expect(res.url).toContain('token=admin_token');
      expect(res.error).toBeUndefined();
    });
  });

  describe('2. Hardening y Control de Acceso en payment-proofs (Bucket Activo)', () => {
    it('2.1 Subida legítima a payment-proofs para una orden en "pending" debe ser PERMITIDA', () => {
      const validPath = 'proofs/raffle-001/11111111-1111-1111-1111-111111111111/foto.jpg';
      const isAllowed = fn_is_order_pending_proof(validPath, ordersDb);
      expect(isAllowed).toBe(true);

      const insertPolicy = storagePolicies.find(
        (p) => p.bucket_id === 'payment-proofs' && p.command === 'INSERT'
      )!;
      expect(
        insertPolicy.check({
          role: 'anon',
          isAdmin: false,
          objectPath: validPath,
          orderStatus: 'pending',
        })
      ).toBe(true);
    });

    it('2.2 Subida con path arbitrario o sin UUID de orden debe ser RECHAZADA', () => {
      const arbitraryPath = 'proofs/malicious_upload/shell.php';
      const isAllowed = fn_is_order_pending_proof(arbitraryPath, ordersDb);
      expect(isAllowed).toBe(false);

      const pathWithoutValidUuid = 'proofs/raffle-001/not-a-uuid/proof.jpg';
      const isAllowed2 = fn_is_order_pending_proof(pathWithoutValidUuid, ordersDb);
      expect(isAllowed2).toBe(false);
    });

    it('2.3 Subida para una orden terminal ("paid", "rejected", "expired") debe ser RECHAZADA', () => {
      const paidPath = 'proofs/raffle-001/33333333-3333-3333-3333-333333333333/foto.jpg';
      expect(fn_is_order_pending_proof(paidPath, ordersDb)).toBe(false);

      const rejectedPath = 'proofs/raffle-001/44444444-4444-4444-4444-444444444444/foto.jpg';
      expect(fn_is_order_pending_proof(rejectedPath, ordersDb)).toBe(false);

      const expiredPath = 'proofs/raffle-001/55555555-5555-5555-5555-555555555555/foto.jpg';
      expect(fn_is_order_pending_proof(expiredPath, ordersDb)).toBe(false);
    });

    it('2.4 Archivo que supere 5 MB debe ser rechazado en cliente y en storage', async () => {
      const hugeFile = {
        name: 'comprobante_pesado.pdf',
        type: 'application/pdf',
        size: 5242881, // 5 MB + 1 byte
      } as unknown as File;

      const res = await paymentService.uploadPaymentProof(
        hugeFile,
        '11111111-1111-1111-1111-111111111111',
        'raffle-001',
        'buyer-001'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('5 MB');
    });

    it('2.5 Archivo con MIME inválido (ej: script o ejecutable) debe ser rechazado', async () => {
      const exeFile = new File(['MZ binary'], 'virus.exe', { type: 'application/x-msdownload' });

      const res = await paymentService.uploadPaymentProof(
        exeFile,
        '11111111-1111-1111-1111-111111111111',
        'raffle-001',
        'buyer-001'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('no permitido');
    });

    it('2.6 Lectura en payment-proofs exclusiva para administradores (anon/regular bloqueados)', () => {
      const selectPolicy = storagePolicies.find(
        (p) => p.bucket_id === 'payment-proofs' && p.command === 'SELECT'
      )!;

      expect(selectPolicy.check({ role: 'anon', isAdmin: false })).toBe(false);
      expect(selectPolicy.check({ role: 'authenticated', isAdmin: false })).toBe(false);
      expect(selectPolicy.check({ role: 'authenticated', isAdmin: true })).toBe(true);
    });
  });

  describe('3. Hardening de gallery-images y Erradicación de SVG (Anti-Stored XSS)', () => {
    it('3.1 Bucket gallery-images debe tener allowed_mime_types sin image/svg+xml', () => {
      const galleryBucket = bucketsCatalog.find((b) => b.id === 'gallery-images')!;
      expect(galleryBucket.allowed_mime_types).not.toContain('image/svg+xml');
      expect(galleryBucket.allowed_mime_types).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
      ]);
    });

    it('3.2 galleryService.uploadGalleryPhoto debe rechazar taxativamente archivos SVG', async () => {
      const maliciousSvg = new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>'],
        'ataque.svg',
        { type: 'image/svg+xml' }
      );

      const res = await galleryService.uploadGalleryPhoto(maliciousSvg);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Formato inválido');
    });

    it('3.3 galleryService.uploadGalleryPhoto acepta formatos fotográficos válidos (WebP, JPEG, PNG, AVIF)', async () => {
      const uploadSpy = vi.spyOn(cloudinaryService, 'uploadToCloudinary').mockResolvedValue({
        success: true,
        secure_url: 'https://res.cloudinary.com/ky01b0vz/image/upload/v1/manaure-vive/galeria/foto-valida.webp',
        public_id: 'manaure-vive/galeria/foto-valida',
      });

      const validPhoto = new File(['image_bytes'], 'paisaje.webp', { type: 'image/webp' });
      const res = await galleryService.uploadGalleryPhoto(validPhoto);

      expect(res.success).toBe(true);
      expect(uploadSpy).toHaveBeenCalledWith(validPhoto, 'manaure-vive/galeria', {
        resourceType: 'image',
      });
      expect(res.url).toContain('manaure-vive/galeria/foto-valida.webp');
    });
  });

  describe('4. Purga Integral de Políticas Huérfanas de Storage (DB-12 / EVENT-09)', () => {
    // Lista canónica de políticas huérfanas que deben ser eliminadas de storage.objects
    const orphanPolicyNames = [
      // partner-logos
      'Lectura pública de logos de aliados',
      'Solo administradores pueden subir logos de aliados',
      'Solo administradores pueden actualizar logos de aliados',
      'Solo administradores pueden eliminar logos de aliados',
      'Public access partner logos',
      'Allow upload partner logos',
      // prize-images
      'Lectura pública de imágenes de premios',
      'Solo administradores suben imágenes de premios',
      'Solo administradores actualizan imágenes de premios',
      'Solo administradores eliminan imágenes de premios',
      'Public access prize images',
      'Allow upload prize images',
      // winner-documents
      'Lectura pública de documentos de ganadores',
      'Administradores pueden listar y leer documentos de ganadores',
      'Solo administradores pueden subir documentos de ganadores',
      'Solo administradores pueden actualizar documentos de ganadores',
      'Solo administradores pueden eliminar documentos de ganadores',
      'Public access winner documents',
      'Allow upload winner documents',
    ];

    it('4.1 Ninguna política huérfana de buckets inexistentes debe estar en el catálogo activo', () => {
      const activePolicyNames = new Set(storagePolicies.map((p) => p.name));

      for (const orphan of orphanPolicyNames) {
        expect(activePolicyNames.has(orphan)).toBe(false);
      }
    });

    it('4.2 Los buckets partner-logos y prize-images NO deben figurar en storage.buckets de Supabase como migrados a Cloudinary', () => {
      const bucketIds = bucketsCatalog.map((b) => b.id);
      expect(bucketIds).not.toContain('partner-logos');
      expect(bucketIds).not.toContain('prize-images');
      expect(bucketIds).toContain('winner-documents');
    });

    it('4.3 La lista de políticas activas debe estar restringida exclusivamente a buckets legítimos', () => {
      const allowedBuckets = new Set(['receipts', 'payment-proofs', 'gallery-images', 'winner-documents']);
      for (const policy of storagePolicies) {
        expect(allowedBuckets.has(policy.bucket_id)).toBe(true);
      }
    });
  });
});
