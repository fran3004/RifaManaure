import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPaymentProof, submitOrderReceipt } from '@/services/paymentService';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn(),
      }),
    },
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('Auditoría 03 — Remediación 3: Idempotencia y Blindaje en submit_payment_proof', () => {
  const mockFile = new File(['dummy-content'], 'recibo_pago.jpg', { type: 'image/jpeg' });
  const mockOrderId = 'a1111111-2222-3333-4444-555555555555';
  const mockRaffleId = 'r1111111-2222-3333-4444-555555555555';
  const mockBuyerId = 'b1111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. uploadPaymentProof debe enviar p_client_idempotency_key a la RPC submit_payment_proof', async () => {
    const customKey = 'c7777777-8888-9999-aaaa-bbbbbbbbbbbb';

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock' }, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        proof_id: 'p1111111-2222-3333-4444-555555555555',
        order_id: mockOrderId,
        status: 'pending_verification',
        idempotency_replayed: false,
        is_replacement: false,
      },
      error: null,
    } as any);

    const result = await uploadPaymentProof(
      mockFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId,
      'REF-123',
      customKey
    );

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('submit_payment_proof', expect.objectContaining({
      p_order_id: mockOrderId,
      p_payment_reference: 'REF-123',
      p_client_idempotency_key: customKey,
    }));
  });

  it('2. si no se proporciona idempotencyKey, uploadPaymentProof debe autogenerar un UUID v4 seguro', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock' }, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        proof_id: 'p1111111-2222-3333-4444-555555555555',
        order_id: mockOrderId,
        status: 'pending_verification',
      },
      error: null,
    } as any);

    await uploadPaymentProof(
      mockFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId
    );

    const rpcCall = vi.mocked(supabase.rpc).mock.calls[0];
    expect(rpcCall[0]).toBe('submit_payment_proof');
    const args = rpcCall[1] as any;
    expect(args.p_client_idempotency_key).toBeDefined();
    // Validar formato UUID v4
    expect(args.p_client_idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('3. debe propagar idempotencyReplayed = true ante respuestas de replay del servidor', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock' }, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        proof_id: 'p1111111-2222-3333-4444-555555555555',
        order_id: mockOrderId,
        status: 'pending_verification',
        idempotency_replayed: true,
        is_replacement: false,
      },
      error: null,
    } as any);

    const result = await uploadPaymentProof(
      mockFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId,
      'REF-SAME',
      'key-replay-1'
    );

    expect(result.success).toBe(true);
    expect(result.idempotencyReplayed).toBe(true);
    expect(result.isReplacement).toBe(false);
  });

  it('4. debe propagar código IDEMPOTENCY_CONFLICT si la clave se reutiliza con parámetros distintos', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock' }, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: false,
        code: 'IDEMPOTENCY_CONFLICT',
        error: 'Conflicto de idempotencia: la clave ya fue utilizada con un comprobante o parámetros diferentes.',
      },
      error: null,
    } as any);

    const result = await uploadPaymentProof(
      mockFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId,
      'REF-DIFF',
      'key-conflict-1'
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(result.error).toContain('Conflicto de idempotencia');
  });

  it('5. debe reflejar isReplacement = true cuando un comprobante pendiente es actualizado/reemplazado', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'proofs/mock' }, error: null }),
    } as any);

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        proof_id: 'p1111111-2222-3333-4444-555555555555',
        order_id: mockOrderId,
        status: 'pending_verification',
        idempotency_replayed: false,
        is_replacement: true,
      },
      error: null,
    } as any);

    const result = await uploadPaymentProof(
      mockFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId,
      'REF-REPLACED',
      'key-replace-1'
    );

    expect(result.success).toBe(true);
    expect(result.isReplacement).toBe(true);
  });

  it('6. debe rechazar archivos que excedan 5 MB antes de llamar a storage o RPC', async () => {
    const hugeFile = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });

    const result = await uploadPaymentProof(
      hugeFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_FILE');
    expect(result.error).toMatch(/tamaño máximo/i);
    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('7. debe rechazar extensiones y formatos no permitidos (.exe, .zip)', async () => {
    const invalidFile = new File(['content'], 'malicious.exe', { type: 'application/x-msdownload' });

    const result = await uploadPaymentProof(
      invalidFile,
      mockOrderId,
      mockRaffleId,
      mockBuyerId
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_FILE');
    expect(result.error).toMatch(/no permitido/i);
    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('8. submitOrderReceipt debe enviar p_client_idempotency_key a submit_payment_proof', async () => {
    const customKey = 'd8888888-9999-aaaa-bbbb-cccccccccccc';

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        success: true,
        order_id: mockOrderId,
        status: 'pending_verification',
      },
      error: null,
    } as any);

    const result = await submitOrderReceipt(
      mockOrderId,
      'proofs/mock/receipt.jpg',
      'REF-LEGACY',
      customKey
    );

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('submit_payment_proof', expect.objectContaining({
      p_order_id: mockOrderId,
      p_client_idempotency_key: customKey,
    }));
  });
});
