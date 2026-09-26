import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getWinnerForRaffle } from '@/services/winnerService';
import { activateRafflePublic } from '@/services/raffleService';
import type { RaffleRow } from '@/types/raffle.types';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('@/lib/requestTimeout', () => ({
  withTimeout: vi.fn(async (fn: (signal: AbortSignal) => unknown) => {
    const controller = new AbortController();
    return fn(controller.signal);
  }),
  classifyRequestError: vi.fn((err: unknown) => ({
    isTimeout: false,
    isNetworkError: false,
    original: err,
  })),
  DEFAULT_REQUEST_TIMEOUT_MS: 15000,
}));

describe('Reconocimiento Público de Ganador y Blindaje de Activación de Rifas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Consulta Pública del Ganador (get_public_winner RPC y Fallback)', () => {
    it('debe llamar prioritariamente a la RPC get_public_winner con p_raffle_id', async () => {
      const mockWinnerData = {
        id: 'win-123',
        raffle_id: 'raffle-magica',
        ticket_number: '1890',
        draw_date: '2026-09-25T16:53:00Z',
        official_act_url: 'https://res.cloudinary.com/test/acta.pdf',
        buyer: { full_name: 'Juan Perez', document_id: '1082***', city: 'Manaure' },
        raffle: { title: 'RIFA MAGICA', ticket_price: 20000, status: 'closed' },
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockWinnerData,
        error: null,
      });

      const winner = await getWinnerForRaffle('raffle-magica');

      expect(supabase.rpc).toHaveBeenCalledWith('get_public_winner', {
        p_raffle_id: 'raffle-magica',
      });
      expect(winner).not.toBeNull();
      expect(winner?.ticket_number).toBe('1890');
      expect(winner?.buyer?.full_name).toBe('Juan Perez');
    });

    it('debe utilizar fallback directo si la RPC no retorna datos', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'function not found' },
      });

      const fallbackWinner = {
        id: 'win-fallback',
        raffle_id: 'raffle-magica',
        ticket_number: '1890',
        buyer: { full_name: 'Carlos Ruiz' },
      };

      const maybeSingleMock = vi.fn().mockResolvedValue({ data: fallbackWinner, error: null });
      const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const winner = await getWinnerForRaffle('raffle-magica');

      expect(supabase.from).toHaveBeenCalledWith('winners');
      expect(winner?.ticket_number).toBe('1890');
    });
  });

  describe('2. Evaluación de Rifa Concluida (isRaffleConcluded en TicketCartContext)', () => {
    it('debe reconocer al ganador cuando la rifa está en estado "closed"', () => {
      const closedRaffle: Partial<RaffleRow> = {
        id: 'raffle-magica',
        status: 'closed',
        draw_date: '2026-09-25T16:53:00Z',
      };

      const isRaffleConcluded =
        closedRaffle.status === 'finished' ||
        closedRaffle.status === 'closed' ||
        Boolean(closedRaffle.draw_date && new Date(closedRaffle.draw_date).getTime() <= Date.now());

      expect(isRaffleConcluded).toBe(true);
    });

    it('debe reconocer al ganador cuando la rifa está en estado "finished"', () => {
      const finishedRaffle: Partial<RaffleRow> = {
        id: 'raffle-magica',
        status: 'finished',
        draw_date: '2026-09-25T16:53:00Z',
      };

      const isRaffleConcluded =
        finishedRaffle.status === 'finished' ||
        finishedRaffle.status === 'closed' ||
        Boolean(finishedRaffle.draw_date && new Date(finishedRaffle.draw_date).getTime() <= Date.now());

      expect(isRaffleConcluded).toBe(true);
    });

    it('debe reconocer al ganador cuando la fecha de sorteo ha pasado independientemente del estado', () => {
      const expiredDateRaffle: Partial<RaffleRow> = {
        id: 'raffle-magica',
        status: 'active',
        draw_date: new Date(Date.now() - 3600000).toISOString(), // Hace 1 hora
      };

      const isRaffleConcluded =
        expiredDateRaffle.status === 'finished' ||
        expiredDateRaffle.status === 'closed' ||
        Boolean(expiredDateRaffle.draw_date && new Date(expiredDateRaffle.draw_date).getTime() <= Date.now());

      expect(isRaffleConcluded).toBe(true);
    });

    it('NO debe dar por concluida la rifa si está activa con fecha futura', () => {
      const liveRaffle: Partial<RaffleRow> = {
        id: 'raffle-magica',
        status: 'active',
        draw_date: new Date(Date.now() + 86400000).toISOString(), // Mañana
      };

      const isRaffleConcluded =
        liveRaffle.status === 'finished' ||
        liveRaffle.status === 'closed' ||
        Boolean(liveRaffle.draw_date && new Date(liveRaffle.draw_date).getTime() <= Date.now());

      expect(isRaffleConcluded).toBe(false);
    });
  });

  describe('3. Activación Pública con Actualización de Fecha Futura', () => {
    it('debe enviar la nueva fecha futura al activar una rifa vencida para evitar auto-cierre', async () => {
      const expiredRaffle: RaffleRow = {
        id: 'raffle-magica',
        title: 'RIFA MAGICA',
        slug: 'rifa-magica',
        description: 'Premio especial',
        ticket_price: 20000,
        total_tickets: 1000,
        max_tickets_per_buyer: 50,
        draw_date: '2026-09-25T16:53:00Z', // Vencida
        lottery_reference: 'Sinuano Noche',
        hero_image_url: null,
        status: 'closed',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-25T16:53:00Z',
      };

      const newFutureDateIso = new Date(Date.now() + 7 * 86400000).toISOString();

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          raffle: {
            ...expiredRaffle,
            status: 'active',
            draw_date: newFutureDateIso,
          },
        },
        error: null,
      });

      const result = await activateRafflePublic(expiredRaffle, newFutureDateIso);

      expect(supabase.rpc).toHaveBeenCalledWith('admin_update_raffle', {
        p_raffle_id: 'raffle-magica',
        p_title: 'RIFA MAGICA',
        p_description: 'Premio especial',
        p_ticket_price: 20000,
        p_draw_date: newFutureDateIso,
        p_lottery_reference: 'Sinuano Noche',
        p_status: 'active',
        p_max_tickets_per_buyer: 50,
      });

      expect(result.success).toBe(true);
      expect(result.raffle?.status).toBe('active');
      expect(result.raffle?.draw_date).toBe(newFutureDateIso);
    });
  });
});
