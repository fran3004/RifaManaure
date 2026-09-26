import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteWinnerAdmin } from '@/services/winnerService';
import { deleteRaffleAdmin } from '@/services/raffleService';
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
  classifyRequestError: vi.fn((err: unknown) => {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
      return { isTimeout: true, isNetworkError: false, original: err };
    }
    return { isTimeout: false, isNetworkError: false, original: err };
  }),
  DEFAULT_REQUEST_TIMEOUT_MS: 15000,
}));

describe('Pruebas Unitarias de Eliminación Administrativa de Ganadores y Rifas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deleteWinnerAdmin (RPC admin_delete_winner)', () => {
    it('debe rechazar si winnerId no es válido o está vacío', async () => {
      const resultEmpty = await deleteWinnerAdmin('');
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error).toContain('ID del ganador');

      const resultWhitespace = await deleteWinnerAdmin('   ');
      expect(resultWhitespace.success).toBe(false);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('debe invocar la RPC admin_delete_winner con el UUID y procesar respuesta exitosa', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          deleted_id: 'winner-123',
          raffle_id: 'raffle-456',
          ticket_number: '0542',
        },
        error: null,
      });

      const res = await deleteWinnerAdmin('winner-123');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_winner', {
        p_winner_id: 'winner-123',
      });
      expect(res.success).toBe(true);
      expect(res.deletedId).toBe('winner-123');
      expect(res.raffleId).toBe('raffle-456');
      expect(res.ticketNumber).toBe('0542');
    });

    it('debe manejar error devuelto por PostgREST / Supabase RPC', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'Permiso denegado: solo administradores pueden eliminar ganadores.',
          details: '',
          hint: '',
        },
      });

      const res = await deleteWinnerAdmin('winner-123');

      expect(res.success).toBe(false);
      expect(res.code).toBe('42501');
      expect(res.error).toContain('Permiso denegado');
    });

    it('debe manejar respuesta de fallo del procedimiento almacenado', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'NOT_FOUND',
          error: 'No se encontró el registro del ganador especificado.',
        },
        error: null,
      });

      const res = await deleteWinnerAdmin('winner-unknown');

      expect(res.success).toBe(false);
      expect(res.code).toBe('NOT_FOUND');
      expect(res.error).toContain('No se encontró el registro');
    });

    it('debe clasificar y retornar timeout si la solicitud se agota', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(supabase.rpc).mockRejectedValueOnce(abortError);

      const res = await deleteWinnerAdmin('winner-123');

      expect(res.success).toBe(false);
      expect(res.isTimeout).toBe(true);
      expect(res.code).toBe('TIMEOUT');
      expect(res.error).toContain('tiempo límite');
    });
  });

  describe('deleteRaffleAdmin (RPC admin_delete_raffle)', () => {
    it('debe rechazar si raffleId está vacío', async () => {
      const resultEmpty = await deleteRaffleAdmin('');
      expect(resultEmpty.success).toBe(false);
      expect(resultEmpty.error).toContain('ID de la rifa');
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('debe invocar la RPC admin_delete_raffle con el UUID y procesar respuesta exitosa', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          deleted_id: 'raffle-456',
          title: 'Gran Rifa Suzuki GN 125',
        },
        error: null,
      });

      const res = await deleteRaffleAdmin('raffle-456');

      expect(supabase.rpc).toHaveBeenCalledWith('admin_delete_raffle', {
        p_raffle_id: 'raffle-456',
      });
      expect(res.success).toBe(true);
      expect(res.deletedId).toBe('raffle-456');
      expect(res.title).toBe('Gran Rifa Suzuki GN 125');
    });

    it('debe manejar error de PostgREST / Supabase', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: 'P0001',
          message: 'Error al eliminar la rifa.',
          details: '',
          hint: '',
        },
      });

      const res = await deleteRaffleAdmin('raffle-456');

      expect(res.success).toBe(false);
      expect(res.code).toBe('P0001');
      expect(res.error).toContain('Error al eliminar');
    });

    it('debe manejar respuesta de fallo del procedimiento almacenado', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'ACTIVE_RAFFLE_RESTRICTED',
          error: 'No se puede eliminar la rifa mientras esté activa en la web pública.',
        },
        error: null,
      });

      const res = await deleteRaffleAdmin('raffle-456');

      expect(res.success).toBe(false);
      expect(res.code).toBe('ACTIVE_RAFFLE_RESTRICTED');
      expect(res.error).toContain('No se puede eliminar');
    });

    it('debe clasificar y retornar timeout si la solicitud de rifa se agota', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(supabase.rpc).mockRejectedValueOnce(abortError);

      const res = await deleteRaffleAdmin('raffle-456');

      expect(res.success).toBe(false);
      expect(res.isTimeout).toBe(true);
      expect(res.code).toBe('TIMEOUT');
      expect(res.error).toContain('tiempo límite');
    });
  });
});
