import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adminGetPaymentProofsStorageStats,
  adminPurgePaymentProofsStorage,
} from '@/services/paymentService';
import { supabase } from '@/lib/supabase';

describe('Admin Purge Payment Proofs Storage Functionality', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('adminGetPaymentProofsStorageStats', () => {
    it('llama a admin_get_payment_proofs_storage_stats sin filtro de rifa por defecto', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          total_proofs: 45,
          active_files_count: 30,
          resolved_files_count: 22,
          pending_files_count: 8,
          purged_files_count: 15,
          storage_objects_count: 30,
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const stats = await adminGetPaymentProofsStorageStats();

      expect(mockRpc).toHaveBeenCalledWith('admin_get_payment_proofs_storage_stats', {
        p_raffle_id: undefined,
      });
      expect(stats.success).toBe(true);
      expect(stats.totalProofs).toBe(45);
      expect(stats.activeFilesCount).toBe(30);
      expect(stats.resolvedFilesCount).toBe(22);
      expect(stats.pendingFilesCount).toBe(8);
      expect(stats.purgedFilesCount).toBe(15);
      expect(stats.storageObjectsCount).toBe(30);
    });

    it('llama a admin_get_payment_proofs_storage_stats filtrando por una rifa específica', async () => {
      const raffleId = 'd3b07384-d113-4856-bb61-419b67324316';
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          total_proofs: 12,
          active_files_count: 7,
          resolved_files_count: 5,
          pending_files_count: 2,
          purged_files_count: 5,
          storage_objects_count: 7,
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const stats = await adminGetPaymentProofsStorageStats(raffleId);

      expect(mockRpc).toHaveBeenCalledWith('admin_get_payment_proofs_storage_stats', {
        p_raffle_id: raffleId,
      });
      expect(stats.success).toBe(true);
      expect(stats.totalProofs).toBe(12);
      expect(stats.activeFilesCount).toBe(7);
      expect(stats.resolvedFilesCount).toBe(5);
    });

    it('retorna success: false con el mensaje de error cuando la RPC falla', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { message: 'Permission denied', code: '42501' } as any,
      });

      const res = await adminGetPaymentProofsStorageStats();

      expect(res.success).toBe(false);
      expect(res.error).toBe('Permission denied');
      expect(res.code).toBe('42501');
      expect(res.totalProofs).toBe(0);
    });
  });

  describe('adminPurgePaymentProofsStorage', () => {
    it('ejecuta el vaciado en alcance resolved con éxito por defecto', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: 'Vaciado de almacenamiento completado exitosamente.',
          purged_proofs_count: 18,
          purged_files_count: 18,
          scope: 'resolved',
          raffle_id: null,
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const res = await adminPurgePaymentProofsStorage({ scope: 'resolved' });

      expect(mockRpc).toHaveBeenCalledWith('admin_purge_payment_proofs_storage', {
        p_scope: 'resolved',
        p_raffle_id: undefined,
      });
      expect(res.success).toBe(true);
      expect(res.purgedProofsCount).toBe(18);
      expect(res.purgedFilesCount).toBe(18);
      expect(res.scope).toBe('resolved');
      expect(res.message).toBe('Vaciado de almacenamiento completado exitosamente.');
    });

    it('ejecuta el vaciado total (all) con filtro de rifa', async () => {
      const raffleId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: 'Vaciado total completado.',
          purged_proofs_count: 5,
          purged_files_count: 5,
          scope: 'all',
          raffle_id: raffleId,
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const res = await adminPurgePaymentProofsStorage({
        scope: 'all',
        raffleId,
      });

      expect(mockRpc).toHaveBeenCalledWith('admin_purge_payment_proofs_storage', {
        p_scope: 'all',
        p_raffle_id: raffleId,
      });
      expect(res.success).toBe(true);
      expect(res.purgedProofsCount).toBe(5);
      expect(res.scope).toBe('all');
      expect(res.raffleId).toBe(raffleId);
    });

    it('maneja el error retornado por la base de datos de forma segura', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { message: 'Solo administradores autorizados pueden realizar esta acción.', code: 'P0001' } as any,
      });

      const res = await adminPurgePaymentProofsStorage({ scope: 'resolved' });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Solo administradores autorizados pueden realizar esta acción.');
      expect(res.code).toBe('P0001');
      expect(res.purgedProofsCount).toBe(0);
    });

    it('invoca supabase.storage.remove cuando la RPC retorna purged_paths', async () => {
      const mockRemove = vi.fn().mockResolvedValue({ data: [], error: null });
      vi.spyOn(supabase.storage, 'from').mockReturnValue({
        remove: mockRemove,
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: 'Vaciado completado.',
          purged_proofs_count: 2,
          purged_files_count: 2,
          scope: 'resolved',
          raffle_id: null,
          purged_paths: ['proofs/r1/o1/comprobante1.jpg', 'proofs/r1/o2/comprobante2.png'],
        },
        error: null,
      });

      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc);

      const res = await adminPurgePaymentProofsStorage({ scope: 'resolved' });

      expect(res.success).toBe(true);
      expect(mockRemove).toHaveBeenCalledWith([
        'proofs/r1/o1/comprobante1.jpg',
        'proofs/r1/o2/comprobante2.png',
      ]);
      expect(res.purgedPaths).toEqual([
        'proofs/r1/o1/comprobante1.jpg',
        'proofs/r1/o2/comprobante2.png',
      ]);
    });
  });
});

