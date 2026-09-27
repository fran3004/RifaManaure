import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { releaseCheckoutReservation } from '@/services/ticketService';

describe('releaseCheckoutReservation - Liberación Inmediata de Reservas al Salir del Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Requiere identificador de orden obligatorio', async () => {
    const res = await releaseCheckoutReservation('');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Identificador de orden requerido');
  });

  it('2. Invoca la RPC release_checkout_reservation con parámetros correctos y retorna éxito', async () => {
    const mockRpcResponse = {
      data: {
        success: true,
        order_id: '11111111-2222-3333-4444-555555555555',
        reference: 'MAN-260927-ABC123',
        status: 'cancelled',
        tickets_released: 3,
        message: 'Reserva liberada exitosamente.',
      },
      error: null,
    };

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockReturnValue(mockRpcResponse as any);

    const res = await releaseCheckoutReservation(
      '11111111-2222-3333-4444-555555555555',
      'key-uuid-1234',
      'MAN-260927-ABC123'
    );

    expect(rpcSpy).toHaveBeenCalledWith('release_checkout_reservation', {
      p_order_id: '11111111-2222-3333-4444-555555555555',
      p_client_idempotency_key: 'key-uuid-1234',
      p_order_reference: 'MAN-260927-ABC123',
    });

    expect(res.success).toBe(true);
    expect(res.orderId).toBe('11111111-2222-3333-4444-555555555555');
    expect(res.reference).toBe('MAN-260927-ABC123');
    expect(res.status).toBe('cancelled');
    expect(res.ticketsReleased).toBe(3);
    expect(res.message).toContain('Reserva liberada exitosamente');
  });

  it('3. Retorna error si el servidor rechaza la liberación por falta de autorización o estado inválido', async () => {
    const mockRpcResponse = {
      data: {
        success: false,
        code: 'FORBIDDEN',
        error: 'No está autorizado para liberar los boletos de esta orden.',
      },
      error: null,
    };

    vi.spyOn(supabase, 'rpc').mockReturnValue(mockRpcResponse as any);

    const res = await releaseCheckoutReservation(
      '11111111-2222-3333-4444-555555555555',
      'wrong-key',
      'WRONG-REF'
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe('No está autorizado para liberar los boletos de esta orden.');
    expect(res.code).toBe('FORBIDDEN');
  });

  it('4. Retorna CLIENT_TIMEOUT controlado si la llamada a la RPC excede el tiempo límite', async () => {
    // Promesa que nunca se resuelve para forzar timeout
    const hangingPromise = new Promise(() => {});
    vi.spyOn(supabase, 'rpc').mockReturnValue(hangingPromise as any);

    const res = await releaseCheckoutReservation(
      '11111111-2222-3333-4444-555555555555',
      'key-123',
      'MAN-123',
      50 // 50ms de timeout para la prueba
    );

    expect(res.success).toBe(false);
    expect(res.isTimeout).toBe(true);
    expect(res.code).toBe('CLIENT_TIMEOUT');
  });

  it('5. Maneja respuesta idempotente si la orden ya había sido cancelada', async () => {
    const mockRpcResponse = {
      data: {
        success: true,
        order_id: '11111111-2222-3333-4444-555555555555',
        reference: 'MAN-260927-ABC123',
        status: 'cancelled',
        already_released: true,
        tickets_released: 0,
        message: 'Los boletos de esta orden ya habían sido liberados previamente.',
      },
      error: null,
    };

    vi.spyOn(supabase, 'rpc').mockReturnValue(mockRpcResponse as any);

    const res = await releaseCheckoutReservation(
      '11111111-2222-3333-4444-555555555555',
      'key-uuid-1234',
      'MAN-260927-ABC123'
    );

    expect(res.success).toBe(true);
    expect(res.ticketsReleased).toBe(0);
    expect(res.message).toContain('ya habían sido liberados previamente');
  });
});
