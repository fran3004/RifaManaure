import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from '@/lib/supabase';
import { inviteAdminUser } from '@/services/adminUserService';
import {
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  togglePaymentAccountActive,
} from '@/services/paymentService';
import {
  createPartner,
  updatePartner,
  deletePartner,
  togglePartnerActive,
} from '@/services/partnerService';

/**
 * Suite de Verificación de Reglas Estrictas para Rol 'admin' vs 'superadmin'
 * 1. Prohibición total de invitar a nuevos administradores (exclusivo superadmin).
 * 2. Prohibición total de mutar Cuentas de Pago (payment_accounts) por RLS.
 * 3. Prohibición total de mutar Aliados (partners) por RLS.
 */
describe('Reglas Estrictas de Seguridad: Rol Admin vs Superadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Invitación de Usuarios: Exclusividad de Superadmin', () => {
    const functionsProto = Object.getPrototypeOf(supabase.functions);

    it('1.1 La Edge Function debe rechazar con 403 si un admin regular intenta invitar', async () => {
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: null,
        error: {
          context: {
            status: 403,
          },
          message: 'Edge Function returned a non-2xx status code',
        },
      } as any);

      // El fallback a RPC también rechaza porque es admin regular
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Acceso denegado: solo los superadministradores pueden invitar a nuevos administradores al sistema.',
        },
        error: null,
      } as any);

      const result = await inviteAdminUser({
        email: 'intruso@manaurevive.com',
        role: 'admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('solo los superadministradores pueden invitar');

      invokeSpy.mockRestore();
      rpcSpy.mockRestore();
    });

    it('1.2 La RPC admin_invite_user debe rechazar directamente a administradores regulares', async () => {
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: null,
        error: new Error('Network error'),
      } as any);

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Acceso denegado: solo los superadministradores pueden invitar a nuevos administradores al sistema.',
        },
        error: null,
      } as any);

      const result = await inviteAdminUser({
        email: 'otro@manaurevive.com',
        role: 'admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Acceso denegado: solo los superadministradores pueden invitar a nuevos administradores al sistema.');

      invokeSpy.mockRestore();
      rpcSpy.mockRestore();
    });
  });

  describe('2. Cuentas de Pago: Bloqueo de Mutación para Rol Admin', () => {
    it('2.1 createPaymentAccount debe fallar si las políticas RLS bloquean la inserción (42501)', async () => {
      const insertSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        insert: vi.fn().mockReturnValueOnce({
          select: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "payment_accounts"',
              },
            }),
          }),
        }),
      } as any);

      const result = await createPaymentAccount({
        bank_name: 'Banco Malicioso',
        account_number: '1234567890',
        account_holder: 'Usuario No Superadmin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      insertSpy.mockRestore();
    });

    it('2.2 updatePaymentAccount debe fallar si las políticas RLS bloquean la actualización (42501)', async () => {
      const updateSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        update: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            select: vi.fn().mockReturnValueOnce({
              single: vi.fn().mockResolvedValueOnce({
                data: null,
                error: {
                  code: '42501',
                  message: 'permission denied for table payment_accounts',
                },
              }),
            }),
          }),
        }),
      } as any);

      const result = await updatePaymentAccount('acc-1', {
        account_holder: 'Titular Alterado',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      updateSpy.mockRestore();
    });

    it('2.3 deletePaymentAccount debe fallar si las políticas RLS bloquean el borrado', async () => {
      const deleteSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        delete: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            error: {
              code: '42501',
              message: 'permission denied for table payment_accounts',
            },
          }),
        }),
      } as any);

      const result = await deletePaymentAccount('acc-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      deleteSpy.mockRestore();
    });

    it('2.4 togglePaymentAccountActive debe fallar si las políticas RLS bloquean el cambio de estado', async () => {
      const toggleSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        update: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            error: {
              code: '42501',
              message: 'permission denied for table payment_accounts',
            },
          }),
        }),
      } as any);

      const result = await togglePaymentAccountActive('acc-1', false);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      toggleSpy.mockRestore();
    });
  });

  describe('3. Aliados: Bloqueo de Mutación para Rol Admin', () => {
    it('3.1 createPartner debe fallar si las políticas RLS bloquean la inserción (42501)', async () => {
      const insertSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        insert: vi.fn().mockReturnValueOnce({
          select: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "partners"',
              },
            }),
          }),
        }),
      } as any);

      const result = await createPartner({
        name: 'Aliado Falso',
        slug: 'aliado-falso',
        category: 'Aventura',
        display_order: 1,
        is_active: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      insertSpy.mockRestore();
    });

    it('3.2 updatePartner debe fallar si las políticas RLS bloquean la edición', async () => {
      const updateSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        update: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            select: vi.fn().mockReturnValueOnce({
              single: vi.fn().mockResolvedValueOnce({
                data: null,
                error: {
                  code: '42501',
                  message: 'permission denied for table partners',
                },
              }),
            }),
          }),
        }),
      } as any);

      const result = await updatePartner('part-1', {
        name: 'Nombre Alterado',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      updateSpy.mockRestore();
    });

    it('3.3 deletePartner debe fallar si las políticas RLS bloquean el borrado', async () => {
      const deleteSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            maybeSingle: vi.fn().mockResolvedValueOnce({
              data: { id: 'part-1', logo_url: null },
              error: null,
            }),
          }),
        }),
        delete: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            error: {
              code: '42501',
              message: 'permission denied for table partners',
            },
          }),
        }),
      } as any);

      const result = await deletePartner('part-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      deleteSpy.mockRestore();
    });

    it('3.4 togglePartnerActive debe fallar si las políticas RLS bloquean la activación/desactivación', async () => {
      const toggleSpy = vi.spyOn(supabase, 'from').mockReturnValueOnce({
        update: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            error: {
              code: '42501',
              message: 'permission denied for table partners',
            },
          }),
        }),
      } as any);

      const result = await togglePartnerActive('part-1', false);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      toggleSpy.mockRestore();
    });
  });
});
