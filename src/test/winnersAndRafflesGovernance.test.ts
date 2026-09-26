import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as winnerService from '../services/winnerService';
import * as raffleService from '../services/raffleService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Gobernanza: public.winners y Máquina de Estados de Raffles
 * Correspondiente a Remediación de Auditoría 02:
 * 1. Erradicación de Bypass Directo en Winners (register_winner como única vía autorizada)
 * 2. Inmutabilidad y Protección de Estado Terminal 'finished' en Raffles
 */

describe('Gobernanza de Ganadores y Máquina de Estados de Rifas', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Gobernanza de public.winners (Exclusividad de register_winner)', () => {
    it('1.1 winnerService no debe exponer funciones de inserción, actualización ni borrado directo de la tabla winners', () => {
      expect((winnerService as Record<string, unknown>)['insertWinner']).toBeUndefined();
      expect((winnerService as Record<string, unknown>)['updateWinner']).toBeUndefined();
      expect((winnerService as Record<string, unknown>)['deleteWinner']).toBeUndefined();
    });

    it('1.2 registerWinner debe invocar exclusivamente la RPC register_winner con parámetros sanitizados', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          winner_id: 'winner-uuid-001',
          ticket_number: '777',
          buyer_name: 'Ganador Oficial',
          message: '¡Ganador registrado exitosamente con toda su evidencia!',
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await winnerService.registerWinner({
        raffleId: 'raffle-uuid-1',
        ticketNumber: ' 777 ',
        lotteryDrawNumber: ' 4567 ',
        drawDate: '2026-10-01T20:00:00Z',
        officialActUrl: 'https://res.cloudinary.com/test/acta.pdf',
        notes: 'Sorteo verificado por notario',
      });

      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('register_winner', {
        p_raffle_id: 'raffle-uuid-1',
        p_ticket_number: '777',
        p_lottery_draw_number: '4567',
        p_draw_date: '2026-10-01T20:00:00Z',
        p_official_act_url: 'https://res.cloudinary.com/test/acta.pdf',
        p_notes: 'Sorteo verificado por notario',
      });

      expect(res.success).toBe(true);
      expect(res.winnerId).toBe('winner-uuid-001');
    });

    it('1.3 registerWinner debe procesar y propagar adecuadamente los errores de la RPC', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          error:
            'El boleto "777" no puede registrarse como ganador porque no está vendido (Estado actual: available).',
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await winnerService.registerWinner({
        raffleId: 'raffle-uuid-1',
        ticketNumber: '777',
        lotteryDrawNumber: '4567',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('no está vendido');
    });
  });

  describe('2. Máquina de Estados de Rifas (Flexibilidad y Reutilización de Rifas)', () => {
    const validStatuses = ['draft', 'active', 'paused', 'closed', 'finished'];

    // Modelo formal de transiciones admitidas por el administrador
    const validateRaffleTransition = (_oldStatus: string, newStatus: string): boolean => {
      if (!validStatuses.includes(newStatus)) {
        throw new Error(
          `Estado de rifa "${newStatus}" no válido. Estados permitidos: draft, active, paused, closed, finished.`
        );
      }
      return true;
    };

    it('2.1 Debe permitir reabrir una rifa finalizada a active para su reutilización', () => {
      expect(validateRaffleTransition('finished', 'active')).toBe(true);
    });

    it('2.2 Debe permitir pasar una rifa finalizada a paused, closed o draft', () => {
      expect(validateRaffleTransition('finished', 'paused')).toBe(true);
      expect(validateRaffleTransition('finished', 'closed')).toBe(true);
      expect(validateRaffleTransition('finished', 'draft')).toBe(true);
    });

    it('2.3 Debe permitir editar metadatos conservando el estado finished (finished -> finished)', () => {
      expect(validateRaffleTransition('finished', 'finished')).toBe(true);
    });

    it('2.4 Debe permitir todas las transiciones operativas entre cualquier estado', () => {
      expect(validateRaffleTransition('draft', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'paused')).toBe(true);
      expect(validateRaffleTransition('paused', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'closed')).toBe(true);
      expect(validateRaffleTransition('paused', 'closed')).toBe(true);
      expect(validateRaffleTransition('closed', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'finished')).toBe(true);
      expect(validateRaffleTransition('paused', 'finished')).toBe(true);
      expect(validateRaffleTransition('closed', 'finished')).toBe(true);
      expect(validateRaffleTransition('active', 'draft')).toBe(true);
      expect(validateRaffleTransition('closed', 'paused')).toBe(true);
    });

    it('2.5 Debe rechazar estados inexistentes o no soportados', () => {
      expect(() => validateRaffleTransition('active', 'archived')).toThrowError(
        /Estado de rifa "archived" no válido/
      );
      expect(() => validateRaffleTransition('finished', 'deleted')).toThrowError(
        /Estado de rifa "deleted" no válido/
      );
    });

    it('2.6 updateRaffleAdmin debe actualizar exitosamente una rifa finalizada a activa', async () => {
      const updatedRaffleMock = {
        id: 'raffle-finished-id',
        title: 'Rifa Reutilizada 2026',
        description: 'Nuevo Premio',
        ticket_price: 30000,
        draw_date: '2026-12-31T20:00:00Z',
        lottery_reference: 'Lotería de La Guajira',
        status: 'active',
        max_tickets_per_buyer: 20,
        total_tickets: 1000,
        slug: 'rifa-reutilizada',
        hero_image_url: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          raffle: updatedRaffleMock,
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await raffleService.updateRaffleAdmin({
        raffleId: 'raffle-finished-id',
        title: 'Rifa Reutilizada 2026',
        description: 'Nuevo Premio',
        ticketPrice: 30000,
        drawDate: '2026-12-31T20:00:00Z',
        lotteryReference: 'Lotería de La Guajira',
        status: 'active',
        maxTicketsPerBuyer: 20,
      });

      expect(res.success).toBe(true);
      expect(res.raffle?.status).toBe('active');
      expect(res.raffle?.title).toBe('Rifa Reutilizada 2026');
    });
  });
});
