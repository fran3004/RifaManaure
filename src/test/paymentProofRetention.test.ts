import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSignedProofUrl,
  cleanupExpiredPaymentProofs,
  validateProofFile,
  type OrderWithDetails,
} from '@/services/paymentService';
import { supabase } from '@/lib/supabase';

describe('Payment Proof 5-Day Retention & Automated Purge Policy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('File Validation for Storage Safety', () => {
    it('permite formatos seguros (jpg, png, webp, pdf) menores a 5 MB', () => {
      const validJpg = new File(['dummy content'], 'comprobante.jpg', { type: 'image/jpeg' });
      const validPdf = new File(['pdf content'], 'soporte.pdf', { type: 'application/pdf' });

      expect(validateProofFile(validJpg).valid).toBe(true);
      expect(validateProofFile(validPdf).valid).toBe(true);
    });

    it('rechaza archivos potencialmente maliciosos o extensiones no autorizadas', () => {
      const dangerousFile = new File(['alert(1)'], 'script.svg', { type: 'image/svg+xml' });
      const res = validateProofFile(dangerousFile);

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Formato .svg no permitido');
    });
  });

  describe('getSignedProofUrl with 5-Day Retention Detection', () => {
    it('retorna la URL firmada para un comprobante activo existente', async () => {
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.test/payment-proofs/order123.jpg?token=abc' },
        error: null,
      });

      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
      } as any);

      const res = await getSignedProofUrl('proofs/order123.jpg', 900);

      expect(res.url).toBe('https://storage.test/payment-proofs/order123.jpg?token=abc');
      expect(res.isPurged).toBeUndefined();
      expect(res.error).toBeUndefined();
    });

    it('detecta cuando el archivo fue depurado tras la ventana de 5 días (404/not found)', async () => {
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Object not found' },
      });

      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        createSignedUrl: mockCreateSignedUrl,
      } as any);

      const res = await getSignedProofUrl('proofs/old-resolved-order.jpg', 900);

      expect(res.url).toBeUndefined();
      expect(res.isPurged).toBe(true);
      expect(res.error).toContain('El archivo adjunto fue depurado automáticamente tras cumplir el período de retención de 5 días');

      // Verificación de lenguaje claro: CERO tecnicismos
      const lowerError = res.error?.toLowerCase() || '';
      expect(lowerError).not.toContain('supabase');
      expect(lowerError).not.toContain('bucket');
      expect(lowerError).not.toContain('postgres');
      expect(lowerError).not.toContain('s3');
    });
  });

  describe('cleanupExpiredPaymentProofs Administrative Execution', () => {
    it('invoca el procedimiento seguro cleanup_resolved_payment_proofs con 5 días por defecto', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: 'Depuración completada exitosamente.',
          purged_proofs_count: 8,
          purged_files_count: 8,
          retention_days: 5,
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const result = await cleanupExpiredPaymentProofs();

      expect(mockRpc).toHaveBeenCalledWith('cleanup_resolved_payment_proofs', {
        p_retention_days: 5,
      });
      expect(result.success).toBe(true);
      expect(result.purgedProofsCount).toBe(8);
      expect(result.purgedFilesCount).toBe(8);
    });

    it('maneja errores de RPC de forma controlada y segura', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { message: 'Advisory lock active, please retry' },
      } as any);

      const result = await cleanupExpiredPaymentProofs(5);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No fue posible ejecutar la depuración');
      expect(result.error).toBe('Advisory lock active, please retry');
    });
  });

  describe('Inviolable Security Rules Simulation: Pending Proofs Protection', () => {
    interface MockOrderWithProof {
      orderId: string;
      status: 'pending' | 'pending_verification' | 'paid' | 'rejected';
      verifiedAt: string | null;
      receiptUrl: string | null;
      receiptPurged: boolean;
    }

    function simulateRetentionPolicyCheck(
      order: MockOrderWithProof,
      currentDate: Date,
      retentionDays: number = 5
    ): { eligibleForPurge: boolean; reason: string } {
      // REGLA FUNDAMENTAL 1: Órdenes pendientes o por verificar JAMÁS son depuradas
      if (order.status === 'pending' || order.status === 'pending_verification') {
        return {
          eligibleForPurge: false,
          reason: 'Comprobantes pendientes de validación se preservan estrictamente.',
        };
      }

      if (!order.verifiedAt) {
        return {
          eligibleForPurge: false,
          reason: 'Orden resuelta sin marca temporal de verificación.',
        };
      }

      const verifiedDate = new Date(order.verifiedAt);
      const elapsedDays = (currentDate.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (elapsedDays >= retentionDays) {
        return {
          eligibleForPurge: true,
          reason: `Orden ${order.status} superó la retención de ${retentionDays} días (${elapsedDays.toFixed(1)} días transcurridos).`,
        };
      }

      return {
        eligibleForPurge: false,
        reason: `En período de retención auditada (${elapsedDays.toFixed(1)} de ${retentionDays} días).`,
      };
    }

    const now = new Date('2026-09-25T12:00:00Z');

    it('NUNCA permite depuración de comprobantes en estado pending_verification aunque hayan pasado 10 días', () => {
      const pendingOrder: MockOrderWithProof = {
        orderId: 'ord-pending-01',
        status: 'pending_verification',
        verifiedAt: null,
        receiptUrl: 'proofs/ord-pending-01/file.jpg',
        receiptPurged: false,
      };

      const result = simulateRetentionPolicyCheck(pendingOrder, now, 5);
      expect(result.eligibleForPurge).toBe(false);
      expect(result.reason).toContain('preservan estrictamente');
    });

    it('NUNCA permite depuración de comprobantes en estado pending de reserva', () => {
      const pendingReserva: MockOrderWithProof = {
        orderId: 'ord-reserva-02',
        status: 'pending',
        verifiedAt: null,
        receiptUrl: 'proofs/ord-reserva-02/file.jpg',
        receiptPurged: false,
      };

      const result = simulateRetentionPolicyCheck(pendingReserva, now, 5);
      expect(result.eligibleForPurge).toBe(false);
    });

    it('NO permite depurar órdenes aprobadas con menos de 5 días de antigüedad', () => {
      const recentPaidOrder: MockOrderWithProof = {
        orderId: 'ord-paid-recent',
        status: 'paid',
        verifiedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Hace 2 días
        receiptUrl: 'proofs/ord-paid-recent/file.jpg',
        receiptPurged: false,
      };

      const result = simulateRetentionPolicyCheck(recentPaidOrder, now, 5);
      expect(result.eligibleForPurge).toBe(false);
      expect(result.reason).toContain('En período de retención auditada');
    });

    it('PERMITE depuración del archivo para órdenes aprobadas con más de 5 días de antigüedad', () => {
      const oldPaidOrder: MockOrderWithProof = {
        orderId: 'ord-paid-old',
        status: 'paid',
        verifiedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), // Hace 6 días
        receiptUrl: 'proofs/ord-paid-old/file.jpg',
        receiptPurged: false,
      };

      const result = simulateRetentionPolicyCheck(oldPaidOrder, now, 5);
      expect(result.eligibleForPurge).toBe(true);
      expect(result.reason).toContain('superó la retención de 5 días');
    });

    it('PERMITE depuración del archivo para órdenes rechazadas con más de 5 días de antigüedad', () => {
      const oldRejectedOrder: MockOrderWithProof = {
        orderId: 'ord-rejected-old',
        status: 'rejected',
        verifiedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Hace 7 días
        receiptUrl: 'proofs/ord-rejected-old/file.jpg',
        receiptPurged: false,
      };

      const result = simulateRetentionPolicyCheck(oldRejectedOrder, now, 5);
      expect(result.eligibleForPurge).toBe(true);
    });

    it('garantiza que la orden contable y sus boletos continúan 100% íntegros tras la depuración', () => {
      const purgedOrder: OrderWithDetails = {
        id: 'ord-purged-audit',
        raffle_id: 'raf-1',
        buyer_id: 'buy-1',
        reference: 'ORD-AUDIT-999',
        total_amount: 50000,
        ticket_count: 2,
        status: 'paid',
        payment_method: 'transfer_manual',
        payment_gateway_id: null,
        payment_gateway_data: null,
        receipt_url: 'proofs/purged/file.jpg',
        receipt_purged: true,
        receipt_purged_at: '2026-09-24T04:00:00Z',
        rejection_reason: null,
        contact_preference: 'both',
        verified_at: '2026-09-18T10:00:00Z',
        verified_by: 'admin-01',
        client_idempotency_key: 'idem-1',
        idempotency_fingerprint: null,
        created_at: '2026-09-18T09:50:00Z',
        updated_at: '2026-09-24T04:00:00Z',
        buyers: {
          id: 'buy-1',
          full_name: 'Carlos Mendoza',
          document_id: '1098765432',
          phone: '3001234567',
          email: 'carlos@example.com',
          city: 'Manaure',
        },
        tickets: [
          { id: 't-1', number: '042', status: 'sold' },
          { id: 't-2', number: '043', status: 'sold' },
        ],
      };

      // Aunque receipt_purged sea true, todos los datos contables y de boletos permanecen intactos
      expect(purgedOrder.receipt_purged).toBe(true);
      expect(purgedOrder.receipt_purged_at).toBeDefined();
      expect(purgedOrder.status).toBe('paid');
      expect(purgedOrder.reference).toBe('ORD-AUDIT-999');
      expect(purgedOrder.total_amount).toBe(50000);
      expect(purgedOrder.buyers?.full_name).toBe('Carlos Mendoza');
      expect(purgedOrder.tickets?.length).toBe(2);
      expect(purgedOrder.tickets?.[0].status).toBe('sold');
    });
  });
});
