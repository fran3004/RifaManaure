import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  classifyRequestError,
  RequestTimeoutError,
  RequestAbortError,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '@/lib/requestTimeout';

// Mock de Supabase client singleton
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

import { supabase } from '@/lib/supabase';
import { createOrder, verifyPublicOrderOrTickets } from '@/services/ticketService';
import {
  uploadPaymentProof,
  approveOrderPayment,
  rejectOrderPayment,
  cancelOrder,
} from '@/services/paymentService';
import { updateRaffleAdmin } from '@/services/raffleService';

describe('requestTimeout - Mecanismo centralizado de timeout y resiliencia de red', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Debe completar exitosamente cuando la operación responde antes del timeout', async () => {
    const result = await withTimeout(
      async () => {
        return { success: true, payload: 'test_data' };
      },
      { timeoutMs: 1000 }
    );

    expect(result).toEqual({ success: true, payload: 'test_data' });
  });

  it('2. Debe disparar RequestTimeoutError (CLIENT_TIMEOUT) cuando la operación excede el timeout', async () => {
    vi.useFakeTimers();

    const slowOperation = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve('completed_too_late'), 20000);
      });

    const promise = withTimeout(slowOperation, { timeoutMs: 15000 });

    // Avanzar el tiempo 15 segundos
    vi.advanceTimersByTime(15000);

    await expect(promise).rejects.toThrow(RequestTimeoutError);
    await expect(promise).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
      isTimeout: true,
      timeoutMs: 15000,
    });
  });

  it('3. Debe limpiar incondicionalmente el temporizador al completarse con éxito', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    await withTimeout(async () => 'ok', { timeoutMs: 5000 });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('4. Debe vincular la señal nativa abortSignal si el builder de Supabase lo soporta', async () => {
    const mockAbortSignal = vi.fn();
    const mockQuery = {
      abortSignal: mockAbortSignal,
      then(onfulfilled: any) {
        return Promise.resolve({ data: 'mock_data', error: null }).then(onfulfilled);
      },
    };

    const result = await withTimeout(() => mockQuery as any, { timeoutMs: 5000 });

    expect(mockAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(result).toEqual({ data: 'mock_data', error: null });
  });

  it('5. Debe abortar inmediatamente con RequestAbortError si se pasa un AbortSignal externo ya cancelado', async () => {
    const externalController = new AbortController();
    externalController.abort();

    const promise = withTimeout(async () => 'should_not_run', {
      timeoutMs: 5000,
      signal: externalController.signal,
    });

    await expect(promise).rejects.toThrow(RequestAbortError);
    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
      isTimeout: false,
    });
  });

  it('6. Debe abortar con RequestAbortError cuando un AbortSignal externo se activa durante la ejecución', async () => {
    vi.useFakeTimers();
    const externalController = new AbortController();

    const longTask = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve('done'), 10000);
      });

    const promise = withTimeout(longTask, {
      timeoutMs: 15000,
      signal: externalController.signal,
    });

    // Disparar abort externo después de 2 segundos
    vi.advanceTimersByTime(2000);
    externalController.abort();

    await expect(promise).rejects.toThrow(RequestAbortError);
    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    });
  });

  it('7. Debe detectar respuestas Postgrest de AbortError simuladas y convertirlas a CLIENT_TIMEOUT si venció el temporizador', async () => {
    vi.useFakeTimers();

    const mockPostgrestQuery = {
      abortSignal: vi.fn(),
      then(onfulfilled: any) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: null,
              error: { message: 'AbortError: The user aborted a request.', hint: 'aborted' },
            });
          }, 15000);
        }).then(onfulfilled);
      },
    };

    const promise = withTimeout(() => mockPostgrestQuery as any, { timeoutMs: 15000 });

    vi.advanceTimersByTime(15000);

    await expect(promise).rejects.toThrow(RequestTimeoutError);
  });

  it('8. classifyRequestError debe catalogar rigurosamente los tipos de error', () => {
    // Timeout
    const timeoutErr = new RequestTimeoutError(15000);
    const classifiedTimeout = classifyRequestError(timeoutErr);
    expect(classifiedTimeout.kind).toBe('CLIENT_TIMEOUT');
    expect(classifiedTimeout.isTimeout).toBe(true);

    // Abort
    const abortErr = new RequestAbortError();
    const classifiedAbort = classifyRequestError(abortErr);
    expect(classifiedAbort.kind).toBe('REQUEST_ABORTED');
    expect(classifiedAbort.isAborted).toBe(true);

    // Red
    const networkErr = new TypeError('Failed to fetch');
    const classifiedNet = classifyRequestError(networkErr);
    expect(classifiedNet.kind).toBe('NETWORK_ERROR');
    expect(classifiedNet.isNetworkError).toBe(true);

    // Error de PostgreSQL / RPC
    const rpcErr = {
      message: 'Boletos no disponibles para reserva',
      code: 'P0001',
      details: 'Error de negocio',
    };
    const classifiedRpc = classifyRequestError(rpcErr);
    expect(classifiedRpc.kind).toBe('RPC_ERROR');
    expect(classifiedRpc.isTimeout).toBe(false);
  });

  it('9. El timeout por defecto debe ser exactamente 15,000 milisegundos', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(15000);
  });

  describe('Integración con Servicios Frontend y Preservación de Idempotencia', () => {
    const mockBuyer = {
      fullName: 'Carlos Vives',
      documentId: '1065892340',
      phone: '3001234567',
      email: 'carlos@vives.com',
      city: 'Manaure',
    };

    it('10. createOrder debe disparar CLIENT_TIMEOUT a los 15s si la base de datos no responde', async () => {
      vi.useFakeTimers();

      // Simular backend colgado que nunca responde
      vi.mocked(supabase.rpc).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 30000))
      );

      const promise = createOrder(
        'raffle-1',
        mockBuyer,
        ['0001', '0002'],
        undefined,
        'transfer_manual',
        'both',
        undefined,
        'key-timeout-test',
        15000
      );

      vi.advanceTimersByTime(15000);

      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.code).toBe('CLIENT_TIMEOUT');
      expect(res.isTimeout).toBe(true);
      expect(res.error).toContain('15 segundos');
    });

    it('11. createOrder debe permitir reintentar con la MISMA clave de idempotencia tras un timeout', async () => {
      const fixedKey = 'idempotency-key-reuse-after-timeout';

      // 1. Simular éxito por replay de la misma clave en el servidor
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'order-recovered-123',
          reference: 'MV-REC123',
          buyer_id: 'buyer-123',
          total_amount: 50000,
          reservation_expires_at: new Date(Date.now() + 600000).toISOString(),
          idempotency_replayed: true,
        },
        error: null,
      } as any);

      const res = await createOrder(
        'raffle-1',
        mockBuyer,
        ['0001', '0002'],
        undefined,
        'transfer_manual',
        'both',
        undefined,
        fixedKey
      );

      expect(res.success).toBe(true);
      expect(res.orderId).toBe('order-recovered-123');
      expect(res.idempotencyReplayed).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_order_secure',
        expect.objectContaining({
          p_client_idempotency_key: fixedKey,
        })
      );
    });

    it('12. verifyPublicOrderOrTickets debe disparar CLIENT_TIMEOUT a los 15s si la RPC tarda demasiado', async () => {
      vi.useFakeTimers();

      vi.mocked(supabase.rpc).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 25000))
      );

      const promise = verifyPublicOrderOrTickets('1065892340', '3001234567', 15000);

      vi.advanceTimersByTime(15000);

      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.code).toBe('CLIENT_TIMEOUT');
      expect(res.isTimeout).toBe(true);
      expect(res.error).toContain('15 segundos');
    });

    it('13. uploadPaymentProof debe disparar CLIENT_TIMEOUT si la subida o RPC excede 15s', async () => {
      vi.useFakeTimers();

      const testFile = new File(['dummy content'], 'proof.jpg', { type: 'image/jpeg' });

      // Simular almacenamiento colgado
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 20000))),
      } as any);

      const promise = uploadPaymentProof(
        testFile,
        'order-123',
        'raffle-123',
        'buyer-123',
        'REF-BANCO',
        'proof-key-1',
        15000
      );

      vi.advanceTimersByTime(15000);

      const res = await promise;
      expect(res.success).toBe(false);
      expect(res.code).toBe('CLIENT_TIMEOUT');
      expect(res.isTimeout).toBe(true);
      expect(res.error).toContain('15 segundos');
    });

    it('14. uploadPaymentProof reintentado tras timeout debe preservar y reenviar la misma proofIdempotencyKey', async () => {
      const testFile = new File(['dummy content'], 'proof.jpg', { type: 'image/jpeg' });
      const preservedKey = 'proof-key-preserved-after-timeout';

      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValueOnce({
          data: { path: 'proofs/raffle/order/receipt.jpg' },
          error: null,
        }),
      } as any);

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'order-123',
          proof_id: 'proof-existing-456',
          status: 'pending_verification',
          idempotency_replayed: true,
        },
        error: null,
      } as any);

      const res = await uploadPaymentProof(
        testFile,
        'order-123',
        'raffle-123',
        'buyer-123',
        'REF-BANCO',
        preservedKey
      );

      expect(res.success).toBe(true);
      expect(res.idempotencyReplayed).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith(
        'submit_payment_proof',
        expect.objectContaining({
          p_client_idempotency_key: preservedKey,
        })
      );
    });

    it('15. Operaciones administrativas (approve, reject, cancel) deben emitir CLIENT_TIMEOUT a los 15s', async () => {
      vi.useFakeTimers();

      vi.mocked(supabase.rpc).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20000))
      );

      // Approve
      const approveP = approveOrderPayment('order-admin-1', undefined, 15000);
      vi.advanceTimersByTime(15000);
      const approveRes = await approveP;
      expect(approveRes.success).toBe(false);
      expect(approveRes.code).toBe('CLIENT_TIMEOUT');
      expect(approveRes.isTimeout).toBe(true);

      // Reject
      const rejectP = rejectOrderPayment('order-admin-2', 'Motivo', undefined, 15000);
      vi.advanceTimersByTime(15000);
      const rejectRes = await rejectP;
      expect(rejectRes.success).toBe(false);
      expect(rejectRes.code).toBe('CLIENT_TIMEOUT');
      expect(rejectRes.isTimeout).toBe(true);

      // Cancel
      const cancelP = cancelOrder('order-admin-3', 'Motivo', 15000);
      vi.advanceTimersByTime(15000);
      const cancelRes = await cancelP;
      expect(cancelRes.success).toBe(false);
      expect(cancelRes.code).toBe('CLIENT_TIMEOUT');
      expect(cancelRes.isTimeout).toBe(true);
    });

    it('16. updateRaffleAdmin debe emitir CLIENT_TIMEOUT a los 15s ante latencia en admin_update_raffle', async () => {
      vi.useFakeTimers();

      vi.mocked(supabase.rpc).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20000))
      );

      const updateP = updateRaffleAdmin(
        {
          raffleId: 'raffle-1',
          title: 'Gran Rifa',
          description: 'Desc',
          ticketPrice: 25000,
          drawDate: '2026-12-31T20:00:00Z',
          lotteryReference: 'Sorteo Guajira',
          status: 'active',
          maxTicketsPerBuyer: 10,
        },
        15000
      );

      vi.advanceTimersByTime(15000);

      const updateRes = await updateP;
      expect(updateRes.success).toBe(false);
      expect(updateRes.code).toBe('CLIENT_TIMEOUT');
      expect(updateRes.isTimeout).toBe(true);
    });
  });
});
