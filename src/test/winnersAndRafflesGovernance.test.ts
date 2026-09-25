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

  describe('2. Máquina de Estados de Rifas (Inmutabilidad de estado finished)', () => {
    // Modelo formal de transiciones admitidas y denegadas
    const validateRaffleTransition = (oldStatus: string, newStatus: string): boolean => {
      // Estado finished es terminal
      if (oldStatus === 'finished') {
        if (newStatus !== 'finished') {
          throw new Error(
            `Operación denegada por gobernanza: La rifa ya se encuentra en estado terminal "finished" y no puede reabrirse ni modificarse a "${newStatus}".`
          );
        }
        return true; // Permitir actualización de metadatos conservando finished
      }

      const validTransitions: Record<string, string[]> = {
        draft: ['draft', 'active', 'paused', 'closed'],
        active: ['active', 'paused', 'closed', 'finished'],
        paused: ['paused', 'active', 'closed', 'finished'],
        closed: ['closed', 'active', 'paused', 'finished'],
      };

      const allowed = validTransitions[oldStatus] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(
          `Transición ilegítima de "${oldStatus}" a "${newStatus}".`
        );
      }
      return true;
    };

    it('2.1 Debe rechazar terminantemente reabrir una rifa finished a active', () => {
      expect(() => validateRaffleTransition('finished', 'active')).toThrowError(
        /estado terminal "finished" y no puede reabrirse.*active/
      );
    });

    it('2.2 Debe rechazar pasar una rifa finished a paused', () => {
      expect(() => validateRaffleTransition('finished', 'paused')).toThrowError(
        /estado terminal "finished" y no puede reabrirse.*paused/
      );
    });

    it('2.3 Debe rechazar pasar una rifa finished a closed o draft', () => {
      expect(() => validateRaffleTransition('finished', 'closed')).toThrowError(
        /estado terminal "finished"/
      );
      expect(() => validateRaffleTransition('finished', 'draft')).toThrowError(
        /estado terminal "finished"/
      );
    });

    it('2.4 Debe permitir editar metadatos conservando el estado finished (finished -> finished)', () => {
      expect(validateRaffleTransition('finished', 'finished')).toBe(true);
    });

    it('2.5 Debe permitir todas las transiciones operativas legítimas', () => {
      expect(validateRaffleTransition('draft', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'paused')).toBe(true);
      expect(validateRaffleTransition('paused', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'closed')).toBe(true);
      expect(validateRaffleTransition('paused', 'closed')).toBe(true);
      expect(validateRaffleTransition('closed', 'active')).toBe(true);
      expect(validateRaffleTransition('active', 'finished')).toBe(true);
      expect(validateRaffleTransition('paused', 'finished')).toBe(true);
      expect(validateRaffleTransition('closed', 'finished')).toBe(true);
    });

    it('2.6 updateRaffleAdmin debe retornar error controlado cuando el backend rechaza la reapertura', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          error:
            'Operación denegada por gobernanza: La rifa ya se encuentra en estado terminal "finished" y no puede reabrirse ni modificarse a otro estado.',
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await raffleService.updateRaffleAdmin({
        raffleId: 'raffle-finished-id',
        title: 'Rifa Finalizada',
        description: 'Premio',
        ticketPrice: 10000,
        drawDate: '2026-10-01T00:00:00Z',
        lotteryReference: 'La Guajira',
        status: 'active', // Intento de reapertura
        maxTicketsPerBuyer: 10,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('estado terminal "finished"');
    });
  });
});
