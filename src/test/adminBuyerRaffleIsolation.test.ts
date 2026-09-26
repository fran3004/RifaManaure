import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchBuyersPaginated,
  fetchBuyerOrdersHistory,
} from '@/services/buyerService';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('Aislamiento Estricto de Compradores por Rifa Activa (buyerService)', () => {
  const mockRaffleId = '11111111-2222-3333-4444-555555555555';
  const mockBuyerId = 'buyer-999';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchBuyersPaginated - Conexión directa a la rifa activa', () => {
    it('debe retornar lista vacía inmediatamente si no se suministra raffleId para evitar mezclas', async () => {
      const result = await fetchBuyersPaginated({
        searchTerm: '',
        page: 1,
        pageSize: 20,
        raffleId: null,
      });

      expect(result.buyers).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(1);
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('debe consultar mediante la RPC admin_get_buyers_by_raffle con el raffleId especificado', async () => {
      const mockBuyersData = [
        {
          id: 'buyer-1',
          full_name: 'Carlos Mendoza',
          document_id: '1098765432',
          phone: '3001234567',
          email: 'carlos@example.com',
          city: 'Manaure',
          created_at: '2026-09-20T10:00:00Z',
          updated_at: '2026-09-20T10:00:00Z',
          total_orders_count: 2,
          paid_orders_count: 1,
          total_spent: 50000,
          total_tickets: 2,
        },
      ];

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          total_count: 1,
          buyers: mockBuyersData,
        },
        error: null,
      } as any);

      const result = await fetchBuyersPaginated({
        searchTerm: 'Carlos',
        page: 1,
        pageSize: 10,
        raffleId: mockRaffleId,
      });

      expect(supabase.rpc).toHaveBeenCalledWith('admin_get_buyers_by_raffle', {
        p_raffle_id: mockRaffleId,
        p_search: 'Carlos',
        p_limit: 10,
        p_offset: 0,
      });

      expect(result.buyers).toHaveLength(1);
      expect(result.buyers[0].full_name).toBe('Carlos Mendoza');
      expect(result.buyers[0].total_spent).toBe(50000);
      expect(result.totalCount).toBe(1);
    });

    it('debe usar fallback resiliente filtrado estrictamente por orders.raffle_id si la RPC falla', async () => {
      // 1. Fallo simulado en RPC
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'function admin_get_buyers_by_raffle does not exist' } as any,
      });

      // 2. Consulta mockeada de fallback
      const mockRawBuyers = [
        {
          id: 'buyer-2',
          full_name: 'Ana María Gómez',
          document_id: '1088776655',
          phone: '3109876543',
          email: 'ana@example.com',
          city: 'Manaure',
          created_at: '2026-09-21T12:00:00Z',
          updated_at: '2026-09-21T12:00:00Z',
          orders: [
            {
              id: 'ord-1',
              raffle_id: mockRaffleId,
              status: 'paid',
              total_amount: 100000,
              ticket_count: 4,
            },
            {
              id: 'ord-otra-rifa',
              raffle_id: 'otra-rifa-id-diferente',
              status: 'paid',
              total_amount: 999999, // NO debe sumarse
              ticket_count: 50, // NO debe sumarse
            },
          ],
        },
      ];

      const rangeMock = vi.fn().mockResolvedValue({
        data: mockRawBuyers,
        count: 1,
        error: null,
      });
      const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const result = await fetchBuyersPaginated({
        page: 1,
        pageSize: 20,
        raffleId: mockRaffleId,
      });

      expect(supabase.from).toHaveBeenCalledWith('buyers');
      expect(eqMock).toHaveBeenCalledWith('orders.raffle_id', mockRaffleId);

      // Verificación de aislamiento de métricas
      expect(result.buyers).toHaveLength(1);
      const buyer = result.buyers[0];
      expect(buyer.full_name).toBe('Ana María Gómez');
      // Solo debe contar la orden de la rifa activa, ignorando la de 'otra-rifa-id-diferente'
      expect(buyer.total_orders_count).toBe(1);
      expect(buyer.paid_orders_count).toBe(1);
      expect(buyer.total_spent).toBe(100000);
      expect(buyer.total_tickets).toBe(4);
    });
  });

  describe('fetchBuyerOrdersHistory - Aislamiento en el modal de detalle', () => {
    it('debe filtrar órdenes y boletos por raffleId cuando se proporciona', async () => {
      const mockOrders = [
        {
          id: 'ord-100',
          reference: 'REF-100',
          total_amount: 50000,
          ticket_count: 2,
          status: 'paid',
          payment_method: 'transfer_manual',
          receipt_url: null,
          created_at: '2026-09-22T10:00:00Z',
          verified_at: '2026-09-22T10:30:00Z',
          rejection_reason: null,
          raffle_id: mockRaffleId,
          raffles: {
            id: mockRaffleId,
            title: 'Gran Rifa Manaure 2026',
            draw_date: '2026-12-31',
          },
        },
      ];

      const mockTickets = [
        {
          id: 'tick-1',
          number: '042',
          status: 'sold',
          order_id: 'ord-100',
          raffle_id: mockRaffleId,
        },
      ];

      // Configurar mocks encadenados para supabase.from('orders') y supabase.from('tickets')
      const ordersOrderMock = vi.fn().mockResolvedValue({ data: mockOrders, error: null });
      const ordersEqRaffleMock = vi.fn().mockReturnValue({ order: ordersOrderMock });
      const ordersEqBuyerMock = vi.fn().mockReturnValue({ eq: ordersEqRaffleMock });
      const ordersSelectMock = vi.fn().mockReturnValue({ eq: ordersEqBuyerMock });

      const ticketsEqRaffleMock = vi.fn().mockResolvedValue({ data: mockTickets, error: null });
      const ticketsEqBuyerMock = vi.fn().mockReturnValue({ eq: ticketsEqRaffleMock });
      const ticketsSelectMock = vi.fn().mockReturnValue({ eq: ticketsEqBuyerMock });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'orders') {
          return { select: ordersSelectMock } as any;
        }
        if (table === 'tickets') {
          return { select: ticketsSelectMock } as any;
        }
        return {} as any;
      });

      const res = await fetchBuyerOrdersHistory(mockBuyerId, mockRaffleId);

      expect(res.success).toBe(true);
      expect(ordersEqBuyerMock).toHaveBeenCalledWith('buyer_id', mockBuyerId);
      expect(ordersEqRaffleMock).toHaveBeenCalledWith('raffle_id', mockRaffleId);
      expect(ticketsEqRaffleMock).toHaveBeenCalledWith('raffle_id', mockRaffleId);

      expect(res.orders).toHaveLength(1);
      expect(res.orders[0].reference).toBe('REF-100');
      expect(res.orders[0].raffle_title).toBe('Gran Rifa Manaure 2026');
      expect(res.orders[0].tickets).toHaveLength(1);
      expect(res.orders[0].tickets![0].ticket_number).toBe('042');
    });
  });
});
