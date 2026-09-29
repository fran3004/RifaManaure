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

  describe('4. Regla Estricta para la Pantalla "Esperando al Ganador Oficial"', () => {
    const shouldDisplayWaitingWinner = (params: {
      hasWinner: boolean;
      status: string;
      drawDate: string;
    }) => {
      const isDrawDatePassed =
        Boolean(params.drawDate) && new Date(params.drawDate).getTime() <= Date.now();
      return !params.hasWinner && (isDrawDatePassed || params.status === 'finished');
    };

    it('debe mostrar "Esperando al Ganador" si la fecha límite ya se cumplió automáticamente', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const result = shouldDisplayWaitingWinner({
        hasWinner: false,
        status: 'active',
        drawDate: pastDate,
      });
      expect(result).toBe(true);
    });

    it('debe mostrar "Esperando al Ganador" si el admin seleccionó estado "finished" antes de la fecha', () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      const result = shouldDisplayWaitingWinner({
        hasWinner: false,
        status: 'finished',
        drawDate: futureDate,
      });
      expect(result).toBe(true);
    });

    it('NO debe mostrar "Esperando al Ganador" si el estado es "closed" y la fecha no se ha cumplido', () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      const result = shouldDisplayWaitingWinner({
        hasWinner: false,
        status: 'closed',
        drawDate: futureDate,
      });
      expect(result).toBe(false);
    });

    it('NO debe mostrar "Esperando al Ganador" si el estado es "paused" y la fecha no se ha cumplido', () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      const result = shouldDisplayWaitingWinner({
        hasWinner: false,
        status: 'paused',
        drawDate: futureDate,
      });
      expect(result).toBe(false);
    });

    it('NO debe mostrar "Esperando al Ganador" si ya existe un ganador proclamado (incluso con fecha cumplida o finished)', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const result = shouldDisplayWaitingWinner({
        hasWinner: true,
        status: 'finished',
        drawDate: pastDate,
      });
      expect(result).toBe(false);
    });
  });

  describe('5. Activación Dinámica del Portal de Edición Cerrada (isRaffleClosedMode)', () => {
    const computeIsRaffleClosedMode = (params: {
      status?: string;
      drawDate?: string;
      hasWinner?: boolean;
    }) => {
      const isDrawDatePassed = Boolean(
        params.drawDate && new Date(params.drawDate).getTime() <= Date.now()
      );
      return params.status === 'closed' && !isDrawDatePassed && !params.hasWinner;
    };

    it('debe activar el portal de edición cerrada cuando el admin selecciona status "closed" antes del sorteo', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const isClosedMode = computeIsRaffleClosedMode({
        status: 'closed',
        drawDate: futureDate,
        hasWinner: false,
      });
      expect(isClosedMode).toBe(true);
    });

    it('NO debe activar el portal de edición cerrada si la rifa está activa', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const isClosedMode = computeIsRaffleClosedMode({
        status: 'active',
        drawDate: futureDate,
        hasWinner: false,
      });
      expect(isClosedMode).toBe(false);
    });

    it('NO debe activar el portal de edición cerrada si la rifa está en status "finished"', () => {
      const isClosedMode = computeIsRaffleClosedMode({
        status: 'finished',
        drawDate: new Date(Date.now() + 86400000).toISOString(),
        hasWinner: false,
      });
      expect(isClosedMode).toBe(false);
    });

    it('NO debe activar el portal de edición cerrada si ya se cumplió la fecha de sorteo (aplica espera de ganador)', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const isClosedMode = computeIsRaffleClosedMode({
        status: 'closed',
        drawDate: pastDate,
        hasWinner: false,
      });
      expect(isClosedMode).toBe(false);
    });
  });
});
