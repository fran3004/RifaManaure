import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ticketService from '../services/ticketService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Auditoría 03: Idempotencia Transaccional en create_order_secure
 *
 * Valida:
 * 1. Envío obligatorio de p_client_idempotency_key a la RPC en createOrder.
 * 2. Generación automática de UUID si el llamador no provee clave.
 * 3. Preservación y reenvío de la clave provista explícitamente (estabilidad de clave en reintentos).
 * 4. Detección y retorno transparente de idempotencyReplayed: true en retransmisiones idénticas.
 * 5. Rechazo controlado con código 'IDEMPOTENCY_CONFLICT' ante reuso de clave con payload mutado.
 * 6. Manejo de colisiones de boletos no disponibles (aislamiento de reservas).
 */

describe('Auditoría 03: Idempotencia Transaccional en Creación de Órdenes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockBuyerData = {
    fullName: 'Comprador Idempotente',
    phone: '3001234567',
    email: 'idempotente@example.com',
    documentId: '1234567890',
    city: 'Manaure',
  };

  it('createOrder debe enviar p_client_idempotency_key como argumento de la RPC create_order_secure', async () => {
    const testKey = '11111111-2222-3333-4444-555555555555';
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'order-uuid-001',
        reference: 'MV-IDEM-001',
        total_amount: 50000,
        ticket_count: 2,
        reservation_expires_at: new Date(Date.now() + 600000).toISOString(),
        idempotency_replayed: false,
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-test',
      mockBuyerData,
      ['010', '020'],
      50000,
      'transfer_manual',
      'whatsapp',
      undefined,
      testKey
    );

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith(
      'create_order_secure',
      expect.objectContaining({
        p_raffle_id: 'raffle-uuid-test',
        p_ticket_numbers: ['010', '020'],
        p_client_idempotency_key: testKey,
      })
    );
    expect(result.success).toBe(true);
    expect(result.orderId).toBe('order-uuid-001');
    expect(result.idempotencyReplayed).toBe(false);
  });

  it('si no se pasa idempotencyKey, createOrder debe auto-generar un UUID v4 válido como clave de idempotencia', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'order-uuid-002',
        reference: 'MV-IDEM-002',
        total_amount: 25000,
        ticket_count: 1,
        idempotency_replayed: false,
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-test',
      mockBuyerData,
      ['030'],
      25000,
      'transfer_manual',
      'whatsapp'
    );

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const callArgs = rpcSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.p_client_idempotency_key).toBeDefined();
    // Validar formato UUID (8-4-4-4-12 hex)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(callArgs.p_client_idempotency_key).toMatch(uuidRegex);
    expect(result.success).toBe(true);
  });

  it('ante reintentos con la misma clave y payload, debe retransmitir la misma orden con idempotencyReplayed = true', async () => {
    const replayKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'order-uuid-existing',
        reference: 'MV-REPLAY-999',
        total_amount: 50000,
        ticket_count: 2,
        reservation_expires_at: '2026-09-24T14:30:00.000Z',
        idempotency_replayed: true,
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-test',
      mockBuyerData,
      ['050', '051'],
      50000,
      'transfer_manual',
      'whatsapp',
      undefined,
      replayKey
    );

    expect(rpcSpy).toHaveBeenCalledWith(
      'create_order_secure',
      expect.objectContaining({
        p_client_idempotency_key: replayKey,
      })
    );
    expect(result.success).toBe(true);
    expect(result.orderId).toBe('order-uuid-existing');
    expect(result.reference).toBe('MV-REPLAY-999');
    expect(result.idempotencyReplayed).toBe(true);
  });

  it('ante conflicto de idempotencia (misma clave, diferente payload), debe propagar el error y código IDEMPOTENCY_CONFLICT', async () => {
    const conflictKey = 'ffffffff-0000-1111-2222-333333333333';
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        code: 'IDEMPOTENCY_CONFLICT',
        error:
          'Conflicto de idempotencia: la clave ya fue utilizada con parámetros de compra diferentes.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-test',
      mockBuyerData,
      ['099'],
      25000,
      'transfer_manual',
      'whatsapp',
      undefined,
      conflictKey
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(result.error).toContain('Conflicto de idempotencia');
  });

  it('ante colisión de boletos con orden ajena, debe reportar indisponibilidad sin crear orden duplicada', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Uno o más números ya no se encuentran disponibles.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-test',
      mockBuyerData,
      ['001'],
      25000,
      'transfer_manual',
      'whatsapp'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Uno o más números ya no se encuentran disponibles.');
  });
});
