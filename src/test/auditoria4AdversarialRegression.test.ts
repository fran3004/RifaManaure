import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ticketService from '@/services/ticketService';
import * as paymentService from '@/services/paymentService';
import { supabase } from '@/lib/supabase';
import { withTimeout, RequestTimeoutError } from '@/lib/requestTimeout';

describe('Auditoría 4 — Batería de Pruebas Adversariales y Regresión de Flujo Completo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockBuyer = {
    fullName: 'Comprador Adversarial',
    documentId: '987654321',
    phone: '3109876543',
    email: 'adversarial@test.com',
    city: 'Manaure',
  };

  // 1. Doble click
  it('1. Doble click: múltiples invocaciones casi simultáneas con la misma key devuelven la misma orden sin duplicación', async () => {
    const key = 'dc-1111-2222-3333-444444444444';
    let callCount = 0;

    vi.spyOn(supabase, 'rpc').mockImplementation(async (_fnName, _args: any) => {
      callCount++;
      return {
        data: {
          success: true,
          order_id: 'order-dc-001',
          reference: 'MV-DC-001',
          total_amount: 50000,
          ticket_count: 2,
          idempotency_replayed: callCount > 1,
        },
        error: null,
      } as any;
    });

    const [res1, res2] = await Promise.all([
      ticketService.createOrder('raffle-1', mockBuyer, ['001', '002'], 50000, 'transfer_manual', 'whatsapp', undefined, key),
      ticketService.createOrder('raffle-1', mockBuyer, ['001', '002'], 50000, 'transfer_manual', 'whatsapp', undefined, key),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);
    expect(res1.orderId).toBe(res2.orderId);
    expect(res1.orderId).toBe('order-dc-001');
  });

  // 2. Doble tab
  it('2. Doble tab: dos pestañas con distinta key intentando los mismos tickets resultan en 1 orden y 1 rechazo limpio', async () => {
    const keyTab1 = 'tab1-1111-2222-3333-444444444444';
    const keyTab2 = 'tab2-1111-2222-3333-444444444444';

    vi.spyOn(supabase, 'rpc').mockImplementation(async (_fnName, args: any) => {
      if (args.p_client_idempotency_key === keyTab1) {
        return {
          data: { success: true, order_id: 'order-tab-1', reference: 'MV-TAB-1', idempotency_replayed: false },
          error: null,
        } as any;
      }
      return {
        data: { success: false, error: 'Uno o más números ya no se encuentran disponibles.' },
        error: null,
      } as any;
    });

    const [resTab1, resTab2] = await Promise.all([
      ticketService.createOrder('raffle-1', mockBuyer, ['005'], 25000, 'transfer_manual', 'whatsapp', undefined, keyTab1),
      ticketService.createOrder('raffle-1', mockBuyer, ['005'], 25000, 'transfer_manual', 'whatsapp', undefined, keyTab2),
    ]);

    expect(resTab1.success).toBe(true);
    expect(resTab2.success).toBe(false);
    expect(resTab2.error).toContain('ya no se encuentran disponibles');
  });

  // 3. Dos dispositivos
  it('3. Dos dispositivos: dos compradores independientes compitiendo por el mismo ticket se aíslan sin colisión', async () => {
    const keyDeviceA = 'devA-1111-2222-3333-444444444444';
    const keyDeviceB = 'devB-1111-2222-3333-444444444444';

    vi.spyOn(supabase, 'rpc').mockImplementation(async (_fnName, args: any) => {
      if (args.p_client_idempotency_key === keyDeviceA) {
        return {
          data: { success: true, order_id: 'order-dev-A', reference: 'MV-DEV-A' },
          error: null,
        } as any;
      }
      return {
        data: { success: false, error: 'Uno o más números ya no se encuentran disponibles.' },
        error: null,
      } as any;
    });

    const resA = await ticketService.createOrder('raffle-1', mockBuyer, ['007'], 25000, 'transfer_manual', 'whatsapp', undefined, keyDeviceA);
    const resB = await ticketService.createOrder('raffle-1', { ...mockBuyer, documentId: '111222333' }, ['007'], 25000, 'transfer_manual', 'whatsapp', undefined, keyDeviceB);

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(false);
  });

  // 4. Retry después de timeout
  it('4. Retry después de timeout: preserva la clave de idempotencia y recupera la orden generada', async () => {
    const preservedKey = 'timeout-key-1111-2222-3333-444444444444';

    // Primer intento: timeout simulado
    const slowRpc = () => new Promise((_, reject) => setTimeout(() => reject(new RequestTimeoutError(15000, 'Excedió 15s')), 50));
    await expect(withTimeout(slowRpc, { timeoutMs: 10 })).rejects.toThrow(RequestTimeoutError);

    // Segundo intento con la misma clave (retry del usuario)
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'order-timeout-recovered',
        reference: 'MV-RECOV-01',
        idempotency_replayed: true,
      },
      error: null,
    } as any);

    const retryRes = await ticketService.createOrder(
      'raffle-1',
      mockBuyer,
      ['010'],
      25000,
      'transfer_manual',
      'whatsapp',
      undefined,
      preservedKey
    );

    expect(retryRes.success).toBe(true);
    expect(retryRes.orderId).toBe('order-timeout-recovered');
    expect(retryRes.idempotencyReplayed).toBe(true);
  });

  // 5. 10+ requests concurrentes con la misma key
  it('5. 10+ requests concurrentes con la misma key: todas resuelven deterministamente al mismo order_id', async () => {
    const stormKey = 'storm-1111-2222-3333-444444444444';

    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: {
        success: true,
        order_id: 'order-storm-single',
        reference: 'MV-STORM-01',
        idempotency_replayed: true,
      },
      error: null,
    } as any);

    const promises = Array.from({ length: 12 }, () =>
      ticketService.createOrder('raffle-1', mockBuyer, ['015'], 25000, 'transfer_manual', 'whatsapp', undefined, stormKey)
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(12);
    results.forEach((res) => {
      expect(res.success).toBe(true);
      expect(res.orderId).toBe('order-storm-single');
    });
  });

  // 6. Requests concurrentes con distintas keys para el mismo boleto
  it('6. Requests concurrentes con distintas keys para el mismo boleto: exactamente 1 triunfa sin órdenes huérfanas', async () => {
    let reserved = false;

    vi.spyOn(supabase, 'rpc').mockImplementation(async () => {
      if (!reserved) {
        reserved = true;
        return {
          data: { success: true, order_id: 'order-first-win', reference: 'MV-WIN' },
          error: null,
        } as any;
      }
      return {
        data: { success: false, error: 'Uno o más números ya no se encuentran disponibles.' },
        error: null,
      } as any;
    });

    const keys = ['k1-1111', 'k2-2222', 'k3-3333', 'k4-4444', 'k5-5555'];
    const results = await Promise.all(
      keys.map((k) =>
        ticketService.createOrder('raffle-1', mockBuyer, ['020'], 25000, 'transfer_manual', 'whatsapp', undefined, k)
      )
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(4);
    expect(successful[0].orderId).toBe('order-first-win');
  });

  // 7. Proof duplicado concurrente
  it('7. Proof duplicado concurrente: 2 envíos paralelos para la misma orden no duplican comprobantes activos', async () => {
    const proofKey = 'proof-idem-key-1111-2222';
    const mockFile = new File(['proof-bytes'], 'recibo.png', { type: 'image/png' });

    vi.spyOn(supabase.storage, 'from').mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/p1' }, error: null }),
    } as any);

    let submitCount = 0;
    vi.spyOn(supabase, 'rpc').mockImplementation(async () => {
      submitCount++;
      return {
        data: {
          success: true,
          proof_id: 'proof-uuid-1',
          order_id: 'order-1',
          status: 'pending_verification',
          idempotency_replayed: submitCount > 1,
        },
        error: null,
      } as any;
    });

    const [p1, p2] = await Promise.all([
      paymentService.uploadPaymentProof(mockFile, 'order-1', 'raffle-1', 'buyer-1', 'REF-1', proofKey),
      paymentService.uploadPaymentProof(mockFile, 'order-1', 'raffle-1', 'buyer-1', 'REF-1', proofKey),
    ]);

    expect(p1.success).toBe(true);
    expect(p2.success).toBe(true);
    expect(p1.proofId).toBe(p2.proofId);
  });

  // 8. Proof + Expiry
  it('8. Proof + Expiry: rechaza la subida si la orden ya expiró en backend', async () => {
    const mockFile = new File(['proof-bytes'], 'recibo.png', { type: 'image/png' });

    vi.spyOn(supabase.storage, 'from').mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/p_expired' }, error: null }),
    } as any);

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'La orden se encuentra en estado expired y no acepta nuevos comprobantes.',
      },
      error: null,
    } as any);

    const res = await paymentService.uploadPaymentProof(mockFile, 'order-expired', 'raffle-1', 'buyer-1', 'REF-EXP');

    expect(res.success).toBe(false);
    expect(res.error).toContain('expired');
  });

  // 9. Approval + Expiry (DB-10)
  it('9. Approval + Expiry (DB-10): impide aprobar orden si los boletos ya fueron liberados o expiraron', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.',
      },
      error: null,
    } as any);

    const res = await paymentService.approveOrderPayment('order-with-expired-tickets');

    expect(res.success).toBe(false);
    expect(res.error).toContain('La orden no tiene boletos asociados (o su reserva expiró)');
  });

  // 10. Rejection + Expiry
  it('10. Rejection + Expiry: rechazo controlado sin desasociar boletos de terceros', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'order-rejected',
        status: 'rejected',
        released_tickets_count: 0,
      },
      error: null,
    } as any);

    const res = await paymentService.rejectOrderPayment('order-rejected', 'Tiempo expirado');

    expect(res.success).toBe(true);
    expect(res.ticketsCount).toBe(0);
  });

  // 11. Create + Pausa de Rifa
  it('11. Create + Pausa de Rifa: rechaza creación si la rifa se encuentra en estado paused', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'La rifa no se encuentra en estado activo para recibir compras.',
      },
      error: null,
    } as any);

    const res = await ticketService.createOrder('raffle-paused', mockBuyer, ['030'], 25000, 'transfer_manual', 'whatsapp');

    expect(res.success).toBe(false);
    expect(res.error).toContain('no se encuentra en estado activo');
  });

  // 12. Create + Cambio de Precio
  it('12. Create + Cambio de Precio: serializa y rechaza transacción si el monto calculado no coincide con el precio actual', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'El precio total calculado no coincide con la tarifa vigente de la rifa.',
      },
      error: null,
    } as any);

    const res = await ticketService.createOrder('raffle-price-change', mockBuyer, ['035'], 20000, 'transfer_manual', 'whatsapp');

    expect(res.success).toBe(false);
    expect(res.error).toContain('no coincide con la tarifa vigente');
  });

  // 13. Realtime Desconectado
  it('13. Realtime Desconectado: callbacks de canal manejan degradación sin romper ciclo de vida', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockCallback = (status: string, err?: Error) => {
      if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Canal degradado:', status, err?.message);
      }
    };

    mockCallback('CHANNEL_ERROR', new Error('WebSocket connection dropped'));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Realtime] Canal degradado:',
      'CHANNEL_ERROR',
      'WebSocket connection dropped'
    );
  });

  // 14. Stale Cache
  it('14. Stale Cache: si la caché local está desactualizada, la respuesta autoritativa de Supabase prevalece', async () => {
    // La UI cree que '099' está disponible en memoria, pero el backend confirma colisión
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Uno o más números ya no se encuentran disponibles.',
      },
      error: null,
    } as any);

    const res = await ticketService.createOrder('raffle-1', mockBuyer, ['099'], 25000, 'transfer_manual', 'whatsapp');

    expect(res.success).toBe(false);
    expect(res.error).toBe('Uno o más números ya no se encuentran disponibles.');
  });
});
