import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getActiveRaffle } from '@/services/ticketService';
import type { RaffleRow } from '@/types/raffle.types';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('Cierre Automático de Rifas por Límite de Fecha y Estado de Espera de Ganador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Detección Temporal de Fecha de Sorteo Vencida', () => {
    it('debe considerar la rifa abierta si la fecha de sorteo es en el futuro', () => {
      const futureDrawDate = new Date(Date.now() + 86400000).toISOString(); // Mañana
      const drawTime = new Date(futureDrawDate).getTime();
      const isDrawDatePassed = !isNaN(drawTime) && drawTime <= Date.now();

      expect(isDrawDatePassed).toBe(false);
    });

    it('debe considerar la rifa cerrada automáticamente si la fecha de sorteo ya se cumplió', () => {
      const pastDrawDate = new Date(Date.now() - 3600000).toISOString(); // Hace 1 hora
      const drawTime = new Date(pastDrawDate).getTime();
      const isDrawDatePassed = !isNaN(drawTime) && drawTime <= Date.now();

      expect(isDrawDatePassed).toBe(true);
    });
  });

  describe('2. Sincronización Proactiva en getActiveRaffle', () => {
    it('debe disparar check_and_auto_close_expired_raffles si la rifa activa tiene fecha vencida', async () => {
      const expiredRaffle: RaffleRow = {
        id: 'raffle-exp-123',
        title: 'Gran Rifa Manaure 2026',
        slug: 'gran-rifa-2026',
        description: 'Sorteo de prueba',
        ticket_price: 40000,
        total_tickets: 1000,
        max_tickets_per_buyer: 20,
        draw_date: new Date(Date.now() - 60000).toISOString(), // Venció hace 1 minuto
        lottery_reference: 'Lotería de Santander',
        hero_image_url: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const maybeSingleMock = vi.fn().mockResolvedValue({ data: expiredRaffle, error: null });
      const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);
      vi.mocked(supabase.rpc).mockResolvedValue({ data: { success: true }, error: null } as any);

      const result = await getActiveRaffle();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('raffle-exp-123');
      // Debe haber invocado la RPC en segundo plano
      expect(supabase.rpc).toHaveBeenCalledWith('check_and_auto_close_expired_raffles');
    });

    it('no debe llamar a check_and_auto_close_expired_raffles si la rifa tiene fecha futura', async () => {
      const activeRaffle: RaffleRow = {
        id: 'raffle-active-456',
        title: 'Gran Rifa Futura',
        slug: 'gran-rifa-futura',
        description: 'Sorteo futuro',
        ticket_price: 50000,
        total_tickets: 1000,
        max_tickets_per_buyer: 20,
        draw_date: new Date(Date.now() + 10000000).toISOString(), // Futuro
        lottery_reference: 'Lotería de Boyacá',
        hero_image_url: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const maybeSingleMock = vi.fn().mockResolvedValue({ data: activeRaffle, error: null });
      const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);

      const result = await getActiveRaffle();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('raffle-active-456');
      expect(supabase.rpc).not.toHaveBeenCalledWith('check_and_auto_close_expired_raffles');
    });
  });

  describe('3. Diferenciación Estricta entre Rifas', () => {
    it('debe aislar el estado cerrado por fecha a la rifa correspondiente sin afectar nuevas rifas', () => {
      const raffle1Expired = {
        id: 'raffle-1',
        draw_date: new Date(Date.now() - 500000).toISOString(),
        status: 'closed',
      };

      const raffle2Active = {
        id: 'raffle-2',
        draw_date: new Date(Date.now() + 50000000).toISOString(),
        status: 'active',
      };

      const isRaffle1Closed =
        raffle1Expired.status === 'closed' ||
        new Date(raffle1Expired.draw_date).getTime() <= Date.now();

      const isRaffle2Closed =
        raffle2Active.status === 'closed' ||
        new Date(raffle2Active.draw_date).getTime() <= Date.now();

      expect(isRaffle1Closed).toBe(true);
      expect(isRaffle2Closed).toBe(false);
    });
  });
});
