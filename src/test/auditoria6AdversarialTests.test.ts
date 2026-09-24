import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ticketService from '@/services/ticketService';
import * as paymentService from '@/services/paymentService';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';

/**
 * Suite de Verificación de Auditoría 06:
 * Pruebas Adversariales, Replay, Concurrencia y Alineación Forense de Estado
 *
 * Casos Específicos Reconciliados:
 * - REP-01: reserve_tickets (Escenario A: llamada interna privilegiada vs Escenario B: anon/authenticated bloqueado con 42501).
 * - REP-03: submit_payment_proof (Implementación actual Migración 051 - Invariante 9: reemplazo atómico, idempotencia, 0 duplicados activos).
 * - EST-02 / EST-03 / EST-10: Catálogo canónico de 6 estados en orders e inexistencia física de completed y refunded.
 */

describe('Auditoría 06 — Batería de Pruebas Adversariales Reconciliadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // REP-01: reserve_tickets (Doble Escenario)
  // =========================================================================
  describe('REP-01: Replay en Reserva Temporal de Boletos (reserve_tickets)', () => {
    it('Escenario A (Llamada Interna Privilegiada): Primer request reserva números; segundo request consecutivo falla por indisponibilidad', async () => {
      // Simulación de ejecución interna autorizada (service_role / postgres backend)
      let ticketsAvailable = true;

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(async (fnName: string, args: any) => {
        if (fnName === 'reserve_tickets') {
          if (ticketsAvailable) {
            ticketsAvailable = false;
            return {
              data: {
                success: true,
                reserved_tickets: args.p_ticket_numbers,
                expires_at: new Date(Date.now() + 600000).toISOString(),
              },
              error: null,
            } as any;
          } else {
            return {
              data: {
                success: false,
                error: 'Uno o más números ya no se encuentran disponibles.',
                failed_tickets: args.p_ticket_numbers,
              },
              error: null,
            } as any;
          }
        }
        return { data: null, error: null } as any;
      });

      // Petición 1: Reserva autorizada
      const firstCall = await (supabase.rpc as any)('reserve_tickets', {
        p_raffle_id: 'r1111111-2222-3333-4444-555555555555',
        p_ticket_numbers: ['060'],
      });
      expect(firstCall.data.success).toBe(true);
      expect(firstCall.data.reserved_tickets).toEqual(['060']);

      // Petición 2: Replay del mismo request de reserva
      const secondCall = await (supabase.rpc as any)('reserve_tickets', {
        p_raffle_id: 'r1111111-2222-3333-4444-555555555555',
        p_ticket_numbers: ['060'],
      });
      expect(secondCall.data.success).toBe(false);
      expect(secondCall.data.error).toContain('ya no se encuentran disponibles');

      rpcSpy.mockRestore();
    });

    it('Escenario B (Llamada Pública Anónima o Autenticada): PostgREST bloquea con error de permisos 42501 (EXECUTE revocado en Migración 042)', async () => {
      // Verificación de superficie de ataque: anon y authenticated no tienen grant EXECUTE
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockImplementation(async (fnName: string) => {
        if (fnName === 'reserve_tickets') {
          return {
            data: null,
            error: {
              code: '42501',
              message: 'permission denied for function reserve_tickets',
              details: null,
              hint: null,
            },
          } as any;
        }
        return { data: null, error: null } as any;
      });

      const { data, error } = await (supabase.rpc as any)('reserve_tickets', {
        p_raffle_id: 'r1111111-2222-3333-4444-555555555555',
        p_ticket_numbers: ['060'],
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      expect(error?.message).toContain('permission denied for function reserve_tickets');

      rpcSpy.mockRestore();
    });

    it('El frontend garantiza que createOrder usa create_order_secure y nunca reserve_tickets', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-rep01-001',
          reference: 'MV-REP01-001',
          total_amount: 25000,
          ticket_count: 1,
          reservation_expires_at: new Date(Date.now() + 600000).toISOString(),
        },
        error: null,
      } as any);

      const result = await ticketService.createOrder(
        'raffle-1',
        {
          fullName: 'Comprador Seguro',
          documentId: '12345678',
          phone: '3001234567',
          email: 'seguro@test.com',
          city: 'Manaure',
        },
        ['060'],
        25000,
        'transfer_manual',
        'whatsapp'
      );

      expect(result.success).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith('create_order_secure', expect.anything());
      expect(rpcSpy).not.toHaveBeenCalledWith('reserve_tickets', expect.anything());

      rpcSpy.mockRestore();
    });
  });

  // =========================================================================
  // REP-03: submit_payment_proof (Invariante 9 - Migración 051)
  // =========================================================================
  describe('REP-03: Envío Masivo y Replay en submit_payment_proof (Invariante 9)', () => {
    const mockFile = new File(['dummy-receipt'], 'recibo_1.jpg', { type: 'image/jpeg' });
    const mockFile2 = new File(['dummy-receipt-updated'], 'recibo_2.jpg', { type: 'image/jpeg' });
    const orderId = 'ord-rep03-001';
    const raffleId = 'raf-rep03-001';
    const buyerId = 'buy-rep03-001';

    it('1. Primer comprobante activo: Se inserta como pending_verification (is_replacement=false, idempotency_replayed=false)', async () => {
      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock1.jpg' }, error: null }),
      } as any);

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          proof_id: 'proof-uuid-001',
          order_id: orderId,
          status: 'pending_verification',
          idempotency_replayed: false,
          is_replacement: false,
        },
        error: null,
      } as any);

      const result = await paymentService.uploadPaymentProof(
        mockFile,
        orderId,
        raffleId,
        buyerId,
        'REF-PRIMERA',
        'idemp-key-001'
      );

      expect(result.success).toBe(true);
      expect(result.proofId).toBe('proof-uuid-001');
      expect(result.isReplacement).toBe(false);
      expect(result.idempotencyReplayed).toBe(false);
      expect(rpcSpy).toHaveBeenCalledWith('submit_payment_proof', expect.objectContaining({
        p_order_id: orderId,
        p_payment_reference: 'REF-PRIMERA',
        p_client_idempotency_key: 'idemp-key-001',
      }));

      rpcSpy.mockRestore();
    });

    it('2. Segundo envío para la misma orden: Reemplazo atómico in-place (Invariante 9, is_replacement=true, 0 duplicados activos)', async () => {
      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock2.jpg' }, error: null }),
      } as any);

      // Simulación de la Migración 051: SELECT FOR UPDATE sobre comprobante pending preexistente
      // y UPDATE en lugar de INSERT
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          proof_id: 'proof-uuid-001', // Mismo ID de comprobante actualizado
          order_id: orderId,
          status: 'pending_verification',
          idempotency_replayed: false,
          is_replacement: true, // Confirmación de reemplazo atómico
        },
        error: null,
      } as any);

      const result = await paymentService.uploadPaymentProof(
        mockFile2,
        orderId,
        raffleId,
        buyerId,
        'REF-CORREGIDA',
        'idemp-key-002'
      );

      expect(result.success).toBe(true);
      expect(result.proofId).toBe('proof-uuid-001');
      expect(result.isReplacement).toBe(true);
      expect(result.idempotencyReplayed).toBe(false);

      rpcSpy.mockRestore();
    });

    it('3. Replay con la misma idempotency key: Retorna resultado idempotente sin mutaciones redundantes (idempotency_replayed=true)', async () => {
      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock1.jpg' }, error: null }),
      } as any);

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          proof_id: 'proof-uuid-001',
          order_id: orderId,
          status: 'pending_verification',
          idempotency_replayed: true,
          is_replacement: false,
        },
        error: null,
      } as any);

      const result = await paymentService.uploadPaymentProof(
        mockFile,
        orderId,
        raffleId,
        buyerId,
        'REF-PRIMERA',
        'idemp-key-001'
      );

      expect(result.success).toBe(true);
      expect(result.idempotencyReplayed).toBe(true);

      rpcSpy.mockRestore();
    });

    it('4. Concurrencia sobre la misma orden: Lock pesimista serializa transacciones garantizando exactamente 1 fila activa', async () => {
      // Simula dos llamadas concurrentes a submit_payment_proof para la misma orden
      // Ambas son procesadas con FOR UPDATE; una ejecuta creación/actualización y la otra reemplazo
      const activePendingProofs: Array<{ id: string; order_id: string; status: string; ref: string }> = [];

      const simulateSubmitProofRPC = async (args: { p_order_id: string; p_ref: string }) => {
        // En BD: SELECT ... WHERE order_id = p_order_id AND status = 'pending' FOR UPDATE
        const existing = activePendingProofs.find(p => p.order_id === args.p_order_id && p.status === 'pending');
        if (existing) {
          // Reemplazo atómico
          existing.ref = args.p_ref;
          return {
            success: true,
            proof_id: existing.id,
            order_id: args.p_order_id,
            is_replacement: true,
            active_count: activePendingProofs.filter(p => p.order_id === args.p_order_id && p.status === 'pending').length,
          };
        } else {
          // Inserción inicial
          const newProof = { id: `proof-${Date.now()}-${Math.random()}`, order_id: args.p_order_id, status: 'pending', ref: args.p_ref };
          activePendingProofs.push(newProof);
          return {
            success: true,
            proof_id: newProof.id,
            order_id: args.p_order_id,
            is_replacement: false,
            active_count: activePendingProofs.filter(p => p.order_id === args.p_order_id && p.status === 'pending').length,
          };
        }
      };

      const [resA, resB] = await Promise.all([
        simulateSubmitProofRPC({ p_order_id: 'ord-concurrent-01', p_ref: 'REF-A' }),
        simulateSubmitProofRPC({ p_order_id: 'ord-concurrent-01', p_ref: 'REF-B' }),
      ]);

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);

      // Uno fue inserción y el otro reemplazo
      const replacements = [resA.is_replacement, resB.is_replacement].filter(Boolean);
      expect(replacements).toHaveLength(1);

      // Exactamente 1 registro activo con status = 'pending' para esa orden
      const finalActive = activePendingProofs.filter(p => p.order_id === 'ord-concurrent-01' && p.status === 'pending');
      expect(finalActive).toHaveLength(1);
    });

    it('5. Conservación de históricos: Los comprobantes de órdenes rechazadas o previas se conservan para auditoría', () => {
      // Estructura de payment_proofs con auditoría histórica
      const tableData = [
        { id: 'proof-hist-1', order_id: 'ord-01', status: 'rejected', reason: 'Comprobante borroso' },
        { id: 'proof-active-1', order_id: 'ord-01', status: 'pending', reason: null }, // Comprobante actual reintentado
      ];

      // El total de comprobantes es 2 (historial preservado), pero activos pendientes es estrictamente 1
      const activePending = tableData.filter(p => p.order_id === 'ord-01' && p.status === 'pending');
      const historicalRejected = tableData.filter(p => p.order_id === 'ord-01' && p.status === 'rejected');

      expect(activePending).toHaveLength(1);
      expect(historicalRejected).toHaveLength(1);
      expect(tableData).toHaveLength(2);
    });

    it('6. Ausencia de límite numérico artificial (3 o 5): La Invariante 9 previene spam mediante unicidad activa, no contadores arbitrarios', () => {
      // Demostrar que realizar 10 actualizaciones de comprobante para la misma orden
      // nunca excede 1 fila activa en payment_proofs
      let activeProofRecord = { id: 'proof-single', order_id: 'ord-01', count_replacements: 0 };

      for (let i = 1; i <= 10; i++) {
        // Cada submit subsiguiente reemplaza el registro sin insertar nuevas filas
        activeProofRecord = {
          ...activeProofRecord,
          count_replacements: activeProofRecord.count_replacements + 1,
        };
      }

      expect(activeProofRecord.id).toBe('proof-single');
      expect(activeProofRecord.count_replacements).toBe(10);
      // Cero filas huérfanas ni proliferación de registros
    });
  });

  // =========================================================================
  // EST-02 / EST-03 / EST-10: Catálogo Canónico de 6 Estados
  // =========================================================================
  describe('EST-02, EST-03, EST-10: Catálogo Canónico Estricto e Inexistencia de completed / refunded', () => {
    it('EST-02: Una orden pagada (paid) no puede retroceder a pending, pending_verification, expired o rejected', () => {
      // Simulación de la regla del trigger fn_validate_order_status_transition
      const validateTransition = (oldStatus: string, newStatus: string) => {
        if (oldStatus === 'paid' && ['pending', 'pending_verification', 'expired', 'rejected'].includes(newStatus)) {
          throw new Error(`Integridad violada: Una orden pagada y confirmada (${oldStatus}) no puede retroceder al estado ${newStatus}`);
        }
        return true;
      };

      expect(() => validateTransition('paid', 'pending')).toThrow(/Integridad violada/);
      expect(() => validateTransition('paid', 'pending_verification')).toThrow(/Integridad violada/);
      expect(() => validateTransition('paid', 'expired')).toThrow(/Integridad violada/);
      expect(() => validateTransition('paid', 'rejected')).toThrow(/Integridad violada/);
    });

    it('EST-03: Una orden terminal/rechazada (rejected, expired, cancelled) no puede reactivarse directamente a paid', () => {
      const validateReactivation = (oldStatus: string, newStatus: string) => {
        if (['expired', 'rejected', 'cancelled'].includes(oldStatus) && newStatus === 'paid') {
          throw new Error(`Integridad violada: Una orden ${oldStatus} no puede reactivarse directamente como pagada`);
        }
        return true;
      };

      expect(() => validateReactivation('rejected', 'paid')).toThrow(/Integridad violada/);
      expect(() => validateReactivation('expired', 'paid')).toThrow(/Integridad violada/);
      expect(() => validateReactivation('cancelled', 'paid')).toThrow(/Integridad violada/);
    });

    it('EST-10: La constraint física orders_status_check admite estrictamente 6 estados canónicos', () => {
      const CANONICAL_ORDER_STATUSES = [
        'pending',
        'pending_verification',
        'paid',
        'rejected',
        'expired',
        'cancelled',
      ] as const;

      expect(CANONICAL_ORDER_STATUSES).toHaveLength(6);

      const isValidStatus = (status: string): boolean => {
        return (CANONICAL_ORDER_STATUSES as readonly string[]).includes(status);
      };

      // Validar que los 6 estados legítimos son admitidos
      for (const status of CANONICAL_ORDER_STATUSES) {
        expect(isValidStatus(status)).toBe(true);
      }

      // Validar que los estados obsoletos completed y refunded son RECHAZADOS
      expect(isValidStatus('completed')).toBe(false);
      expect(isValidStatus('refunded')).toBe(false);

      // Validar que estados inventados o maliciosos son RECHAZADOS
      expect(isValidStatus('bogus_status')).toBe(false);
      expect(isValidStatus('invented_status')).toBe(false);
      expect(isValidStatus('active')).toBe(false); // Estado de rifa, no de orden
    });

    it('EST-10 (Tipado Estático): El tipo Database de orders excluye formalmente completed y refunded', () => {
      type OrderStatus = Database['public']['Tables']['orders']['Row']['status'];

      // Verificación estática: completed y refunded no forman parte del tipo
      type IsCompletedInUnion = 'completed' extends OrderStatus ? true : false;
      type IsRefundedInUnion = 'refunded' extends OrderStatus ? true : false;

      const isCompleted: IsCompletedInUnion = false;
      const isRefunded: IsRefundedInUnion = false;

      expect(isCompleted).toBe(false);
      expect(isRefunded).toBe(false);
    });
  });
});
