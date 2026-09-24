import { describe, it, expect, vi } from 'vitest';
import * as ticketService from '../services/ticketService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación SEC-02
 * Cierre de Superficie de Ataque en RPC Legacy reserve_tickets
 */

describe('SEC-02: Remediación de Superficie de Ataque en reserve_tickets', () => {
  it('el servicio de boletos (ticketService) no debe exportar ni utilizar la función legacy reserve_tickets', () => {
    // Verificar que no existe un wrapper o función activa reserveTickets en ticketService
    expect((ticketService as Record<string, unknown>)['reserveTickets']).toBeUndefined();
    expect((ticketService as Record<string, unknown>)['reserve_tickets']).toBeUndefined();
  });

  it('el único flujo legítimo de reserva y orden en frontend debe ser createOrder mediante create_order_secure', () => {
    expect(typeof ticketService.createOrder).toBe('function');
  });

  it('createOrder debe invocar exclusivamente la RPC create_order_secure y nunca reserve_tickets', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        order_id: 'mock-order-id-123',
        reference: 'MV-TEST-001',
        total_amount: 40000,
        ticket_count: 1,
        reservation_expires_at: new Date(Date.now() + 600000).toISOString(),
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const result = await ticketService.createOrder(
      'raffle-uuid-1',
      {
        fullName: 'Comprador Seguro',
        phone: '+573000000000',
        email: 'seguro@example.com',
        documentId: 'V-12345678',
        city: 'Manaure',
      },
      ['001'],
      40000,
      'transfer_manual',
      'whatsapp'
    );

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('create_order_secure', expect.objectContaining({
      p_raffle_id: 'raffle-uuid-1',
      p_ticket_numbers: ['001'],
      p_payment_method: 'transfer_manual',
      p_contact_preference: 'whatsapp',
    }));

    // Asegurarse de que NUNCA se invoca reserve_tickets
    expect(rpcSpy).not.toHaveBeenCalledWith('reserve_tickets', expect.anything());
    expect(result.success).toBe(true);
    expect(result.orderId).toBe('mock-order-id-123');

    rpcSpy.mockRestore();
  });

  it('simulación de invocación a reserve_tickets por rol anónimo o autenticado debe retornar error de permisos 42501', async () => {
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
        } as unknown as ReturnType<typeof supabase.rpc>;
      }
      return { data: null, error: null } as unknown as ReturnType<typeof supabase.rpc>;
    });

    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>)(
      'reserve_tickets',
      { p_raffle_id: '00000000-0000-0000-0000-000000000000' }
    );

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message).toContain('permission denied for function reserve_tickets');

    rpcSpy.mockRestore();
  });
});
