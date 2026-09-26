import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as raffleService from '@/services/raffleService';
import type { RaffleRow } from '@/types/raffle.types';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

describe('Flexibilidad de Estados y Reutilización de Rifas por el Administrador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseFinishedRaffle: RaffleRow = {
    id: 'raffle-finished-999',
    title: 'Edición Concluida 2025',
    slug: 'edicion-concluida-2025',
    description: 'Camioneta Toyota Hilux 4x4',
    ticket_price: 35000,
    total_tickets: 1000,
    max_tickets_per_buyer: 25,
    draw_date: '2025-12-31T20:00:00Z',
    lottery_reference: 'Lotería de La Guajira',
    hero_image_url: null,
    status: 'finished',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-12-31T20:30:00Z',
  };

  it('1. Debe permitir reabrir y activar directamente una rifa finalizada mediante activateRafflePublic', async () => {
    const updatedRaffle: RaffleRow = {
      ...baseFinishedRaffle,
      status: 'active',
      draw_date: '2026-12-31T20:00:00Z',
      updated_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, raffle: updatedRaffle },
      error: null,
    } as any);

    const result = await raffleService.activateRafflePublic(baseFinishedRaffle);

    expect(result.success).toBe(true);
    expect(result.raffle?.status).toBe('active');
    expect(supabase.rpc).toHaveBeenCalledWith('admin_update_raffle', expect.objectContaining({
      p_raffle_id: 'raffle-finished-999',
      p_status: 'active',
    }));
  });

  it('2. Debe permitir cambiar una rifa finalizada a estado paused', async () => {
    const pausedRaffle: RaffleRow = {
      ...baseFinishedRaffle,
      status: 'paused',
      updated_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, raffle: pausedRaffle },
      error: null,
    } as any);

    const result = await raffleService.pauseRafflePublic(baseFinishedRaffle);

    expect(result.success).toBe(true);
    expect(result.raffle?.status).toBe('paused');
    expect(supabase.rpc).toHaveBeenCalledWith('admin_update_raffle', expect.objectContaining({
      p_raffle_id: 'raffle-finished-999',
      p_status: 'paused',
    }));
  });

  it('3. Debe permitir cambiar una rifa finalizada a estado draft para reutilizarla y editarla en privado', async () => {
    const draftRaffle: RaffleRow = {
      ...baseFinishedRaffle,
      title: 'Edición Renovada 2026',
      status: 'draft',
      updated_at: new Date().toISOString(),
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, raffle: draftRaffle },
      error: null,
    } as any);

    const result = await raffleService.updateRaffleAdmin({
      raffleId: baseFinishedRaffle.id,
      title: 'Edición Renovada 2026',
      description: 'Premio Especial de Verano',
      ticketPrice: 40000,
      drawDate: '2026-11-20T20:00:00Z',
      lotteryReference: 'Lotería de Santander',
      status: 'draft',
      maxTicketsPerBuyer: 30,
    });

    expect(result.success).toBe(true);
    expect(result.raffle?.status).toBe('draft');
    expect(result.raffle?.title).toBe('Edición Renovada 2026');
    expect(supabase.rpc).toHaveBeenCalledWith('admin_update_raffle', expect.objectContaining({
      p_status: 'draft',
    }));
  });

  it('4. Debe permitir transicionar libremente entre cualquiera de los 5 estados (draft, active, paused, closed, finished)', async () => {
    const states: Array<'draft' | 'active' | 'paused' | 'closed' | 'finished'> = [
      'draft',
      'active',
      'paused',
      'closed',
      'finished',
    ];

    for (const targetState of states) {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, raffle: { ...baseFinishedRaffle, status: targetState } },
        error: null,
      } as any);

      const res = await raffleService.updateRaffleAdmin({
        raffleId: baseFinishedRaffle.id,
        title: baseFinishedRaffle.title,
        description: baseFinishedRaffle.description || '',
        ticketPrice: Number(baseFinishedRaffle.ticket_price),
        drawDate: baseFinishedRaffle.draw_date || new Date().toISOString(),
        lotteryReference: baseFinishedRaffle.lottery_reference || '',
        status: targetState,
        maxTicketsPerBuyer: 20,
      });

      expect(res.success).toBe(true);
      expect(res.raffle?.status).toBe(targetState);
    }
  });
});
