import { describe, it, expect, beforeEach, vi } from 'vitest';
import { approveOrderPayment, rejectOrderPayment, cancelOrder } from '@/services/paymentService';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('paymentService - Operaciones Administrativas de Aprobación y Rechazo (DB-01 / DB-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('approveOrderPayment', () => {
    it('debe aprobar el pago exitosamente llamando a la RPC approve_order_payment', async () => {
      const mockOrderId = 'a1111111-1111-1111-1111-111111111111';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: mockOrderId,
          status: 'paid',
          tickets_sold_count: 3,
          message: 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.',
        },
        error: null,
      } as any);

      const result = await approveOrderPayment(mockOrderId);

      expect(supabase.rpc).toHaveBeenCalledWith('approve_order_payment', {
        p_order_id: mockOrderId,
      });
      expect(result.success).toBe(true);
      expect(result.ticketsCount).toBe(3);
      expect(result.message).toContain('Pago aprobado');
    });

    it('debe manejar error DB-10 cuando la orden no tiene boletos asociados', async () => {
      const mockOrderId = 'a2222222-2222-2222-2222-222222222222';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Integridad violada: La orden no tiene boletos asociados (o su reserva expiró) y no puede ser aprobada.',
        },
        error: null,
      } as any);

      const result = await approveOrderPayment(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('La orden no tiene boletos asociados');
    });

    it('debe manejar error de orden ya pagada previamente (idempotencia)', async () => {
      const mockOrderId = 'a3333333-3333-3333-3333-333333333333';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'La orden ya se encuentra aprobada y pagada anteriormente.',
        },
        error: null,
      } as any);

      const result = await approveOrderPayment(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya se encuentra aprobada y pagada');
    });

    it('debe manejar error devuelto directamente a nivel de protocolo Supabase', async () => {
      const mockOrderId = 'a4444444-4444-4444-4444-444444444444';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Acceso denegado: se requiere rol de administrador' },
      } as any);

      const result = await approveOrderPayment(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Acceso denegado: se requiere rol de administrador');
    });

    it('debe capturar excepciones no controladas durante la llamada', async () => {
      const mockOrderId = 'a5555555-5555-5555-5555-555555555555';
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network disconnected'));

      const result = await approveOrderPayment(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network disconnected');
    });
  });

  describe('rejectOrderPayment', () => {
    it('debe rechazar la orden y liberar los boletos de esa orden exclusivamente (DB-01)', async () => {
      const mockOrderId = 'b1111111-1111-1111-1111-111111111111';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: mockOrderId,
          status: 'rejected',
          released_tickets_count: 2,
          message: 'Pago rechazado. Boletos liberados y disponibles para la venta.',
        },
        error: null,
      } as any);

      const result = await rejectOrderPayment(mockOrderId, 'Comprobante ilegible');

      expect(supabase.rpc).toHaveBeenCalledWith('reject_order_payment', {
        p_order_id: mockOrderId,
        p_reason: 'Comprobante ilegible',
      });
      expect(result.success).toBe(true);
      expect(result.ticketsCount).toBe(2);
      expect(result.message).toContain('Pago rechazado');
    });

    it('debe manejar orden ya rechazada previamente (idempotencia)', async () => {
      const mockOrderId = 'b2222222-2222-2222-2222-222222222222';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'La orden ya se encuentra rechazada anteriormente.',
        },
        error: null,
      } as any);

      const result = await rejectOrderPayment(mockOrderId, 'Motivo duplicado');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya se encuentra rechazada');
    });

    it('debe impedir rechazar una orden ya pagada', async () => {
      const mockOrderId = 'b3333333-3333-3333-3333-333333333333';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.',
        },
        error: null,
      } as any);

      const result = await rejectOrderPayment(mockOrderId, 'Intento inválido');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya fue pagada no puede ser rechazada');
    });

    it('debe capturar excepciones no controladas durante el rechazo', async () => {
      const mockOrderId = 'b4444444-4444-4444-4444-444444444444';
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await rejectOrderPayment(mockOrderId, 'Timeout test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });

  describe('cancelOrder (SEC-03: Autorización Administrativa e Idempotencia)', () => {
    it('debe cancelar una orden pendiente exitosamente mediante la RPC cancel_order', async () => {
      const mockOrderId = 'c1111111-1111-1111-1111-111111111111';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: mockOrderId,
          status: 'cancelled',
          tickets_released: 2,
        },
        error: null,
      } as any);

      const result = await cancelOrder(mockOrderId, 'Cancelación administrativa');

      expect(supabase.rpc).toHaveBeenCalledWith('cancel_order', {
        p_order_id: mockOrderId,
        p_reason: 'Cancelación administrativa',
      });
      expect(result.success).toBe(true);
      expect(result.ticketsCount).toBe(2);
      expect(result.message).toContain('Orden cancelada y boletos liberados');
    });

    it('debe rechazar la cancelación si el usuario no tiene permisos de administrador (42501)', async () => {
      const mockOrderId = 'c2222222-2222-2222-2222-222222222222';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'Acceso denegado: se requiere rol de administrador para cancelar órdenes',
          details: null,
          hint: null,
        },
      } as any);

      const result = await cancelOrder(mockOrderId, 'Intento IDOR');

      expect(result.success).toBe(false);
      expect(result.error).toContain('se requiere rol de administrador');
    });

    it('debe reportar error si se intenta cancelar una orden pagada', async () => {
      const mockOrderId = 'c3333333-3333-3333-3333-333333333333';
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'No se puede cancelar una orden que ya fue pagada y confirmada.',
        },
        error: null,
      } as any);

      const result = await cancelOrder(mockOrderId, 'Intento sobre pagada');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ya fue pagada y confirmada');
    });

    it('debe manejar errores y excepciones de red de forma segura', async () => {
      const mockOrderId = 'c4444444-4444-4444-4444-444444444444';
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network failure'));

      const result = await cancelOrder(mockOrderId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });
  });
});
