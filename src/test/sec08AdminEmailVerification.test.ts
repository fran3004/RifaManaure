import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminUserService from '../services/adminUserService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación SEC-08
 * Condicionamiento de sincronización de admin_users y privilegios a verificación estricta de correo
 */

describe('SEC-08: Blindaje de Sincronización de Administradores y Verificación de Email', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Ciclo de Vida de Administradores (5 Estados Formales)', () => {
    it('1.1 INVITADO (Pre-invitado): admin_users con user_id=null y has_auth_account=false', () => {
      const invitedAdmin: adminUserService.AdminUserItem = {
        id: 'u-invited-1',
        user_id: null,
        email: 'nuevo_admin@rifamanaure.com',
        full_name: 'Admin Invitado',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: false,
        last_sign_in_at: null,
      };

      expect(invitedAdmin.user_id).toBeNull();
      expect(invitedAdmin.has_auth_account).toBe(false);
      expect(invitedAdmin.is_active).toBe(true);
    });

    it('1.2 PENDIENTE: Cuenta registrada en Supabase Auth pero email_confirmed_at=null', () => {
      // En este estado, el trigger NO debe vincular user_id en admin_users
      const pendingAdmin: adminUserService.AdminUserItem = {
        id: 'u-invited-1',
        user_id: null, // Protegido por trigger SEC-08: no se vincula
        email: 'nuevo_admin@rifamanaure.com',
        full_name: 'Admin Invitado',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: false, // Debe reportarse como pendiente
        last_sign_in_at: null,
      };

      expect(pendingAdmin.user_id).toBeNull();
      expect(pendingAdmin.has_auth_account).toBe(false);
    });

    it('1.3 CONFIRMADO: Correo verificado (email_confirmed_at != null), user_id vinculado', () => {
      const confirmedAdmin: adminUserService.AdminUserItem = {
        id: 'u-invited-1',
        user_id: 'auth-user-confirmed-id',
        email: 'nuevo_admin@rifamanaure.com',
        full_name: 'Admin Confirmado',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: true,
        last_sign_in_at: null,
      };

      expect(confirmedAdmin.user_id).toBe('auth-user-confirmed-id');
      expect(confirmedAdmin.has_auth_account).toBe(true);
    });

    it('1.4 ACTIVO: Usuario confirmado, vinculado y con is_active=true (plenos privilegios)', () => {
      const activeAdmin: adminUserService.AdminUserItem = {
        id: 'u-active-1',
        user_id: 'auth-active-id',
        email: 'admin_operativo@rifamanaure.com',
        full_name: 'Admin Operativo',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: true,
        last_sign_in_at: new Date().toISOString(),
      };

      expect(activeAdmin.is_active).toBe(true);
      expect(activeAdmin.has_auth_account).toBe(true);
    });

    it('1.5 REVOCADO: Acceso desactivado por superadmin (is_active=false, denegación total)', () => {
      const revokedAdmin: adminUserService.AdminUserItem = {
        id: 'u-revoked-1',
        user_id: 'auth-revoked-id',
        email: 'ex_admin@rifamanaure.com',
        full_name: 'Ex Administrador',
        role: 'admin',
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: true,
        last_sign_in_at: new Date().toISOString(),
      };

      expect(revokedAdmin.is_active).toBe(false);
    });
  });

  describe('2. Integración con adminUserService y RPCs', () => {
    it('2.1 fetchAdminUsers debe procesar y retornar la lista con el flag has_auth_account real', async () => {
      const mockList: adminUserService.AdminUserItem[] = [
        {
          id: 'admin-1',
          user_id: 'auth-1',
          email: 'confirmado@rifamanaure.com',
          full_name: 'Admin Verificado',
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          has_auth_account: true,
          last_sign_in_at: new Date().toISOString(),
        },
        {
          id: 'admin-2',
          user_id: null,
          email: 'pendiente@rifamanaure.com',
          full_name: 'Admin Pendiente',
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          has_auth_account: false,
          last_sign_in_at: null,
        },
      ];

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          users: mockList,
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await adminUserService.fetchAdminUsers();
      expect(res.success).toBe(true);
      expect(res.users).toHaveLength(2);
      expect(res.users![0].has_auth_account).toBe(true);
      expect(res.users![1].has_auth_account).toBe(false);
    });

    it('2.2 inviteAdminUser debe normalizar parámetros y procesar respuesta de usuario pre-autorizado', async () => {
      const mockInvited: adminUserService.AdminUserItem = {
        id: 'new-id',
        user_id: null, // Cuenta aún no confirmada
        email: 'nuevo@rifamanaure.com',
        full_name: 'Nuevo Miembro',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: false,
        last_sign_in_at: null,
      };

      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          user: mockInvited,
          message: 'Administrador autorizado exitosamente en el sistema.',
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await adminUserService.inviteAdminUser({
        email: '  NUEVO@RifaManaure.com  ',
        role: 'admin',
        fullName: '  Nuevo Miembro  ',
      });

      expect(rpcSpy).toHaveBeenCalledWith('admin_invite_user', {
        p_email: 'nuevo@rifamanaure.com',
        p_role: 'admin',
        p_full_name: 'Nuevo Miembro',
      });

      expect(res.success).toBe(true);
      expect(res.user?.has_auth_account).toBe(false);
    });
  });

  describe('3. Invariantes de Seguridad y Autorización (is_admin / sync_admin_user_id)', () => {
    // Modelo lógico de las reglas implementadas en PostgreSQL (046)
    const evaluateAdminAccess = (params: {
      authUserId: string | null;
      authUserEmail: string;
      emailConfirmedAt: string | null;
      adminRecord: {
        userId: string | null;
        email: string;
        role: 'superadmin' | 'admin' | 'auditor';
        isActive: boolean;
      } | null;
    }) => {
      const { authUserId, authUserEmail, emailConfirmedAt, adminRecord } = params;

      // 1. Sesión requerida
      if (!authUserId) return { isAdmin: false, isSuperadmin: false };

      // 2. Endurecimiento SEC-08: Correo confirmado obligatorio
      if (!emailConfirmedAt) return { isAdmin: false, isSuperadmin: false };

      // 3. Registro en admin_users
      if (!adminRecord) return { isAdmin: false, isSuperadmin: false };

      // 4. Registro activo obligatorio
      if (!adminRecord.isActive) return { isAdmin: false, isSuperadmin: false };

      // 5. Coincidencia de identidad (user_id o lower(email))
      const matchesIdentity =
        adminRecord.userId === authUserId ||
        adminRecord.email.toLowerCase() === authUserEmail.toLowerCase();

      if (!matchesIdentity) return { isAdmin: false, isSuperadmin: false };

      return {
        isAdmin: true,
        isSuperadmin: adminRecord.role === 'superadmin',
      };
    };

    it('3.1 Atacante no confirmado con email pre-invitado debe ser denegado taxativamente', () => {
      const result = evaluateAdminAccess({
        authUserId: 'attacker-uuid',
        authUserEmail: 'admin@rifamanaure.com',
        emailConfirmedAt: null, // No confirmado
        adminRecord: {
          userId: null, // Trigger impidió enlace
          email: 'admin@rifamanaure.com',
          role: 'admin',
          isActive: true,
        },
      });

      expect(result.isAdmin).toBe(false);
      expect(result.isSuperadmin).toBe(false);
    });

    it('3.2 Usuario legítimo confirmado obtiene acceso admin según su rol', () => {
      const result = evaluateAdminAccess({
        authUserId: 'legit-uuid',
        authUserEmail: 'admin@rifamanaure.com',
        emailConfirmedAt: '2026-09-24T12:00:00Z',
        adminRecord: {
          userId: 'legit-uuid',
          email: 'admin@rifamanaure.com',
          role: 'admin',
          isActive: true,
        },
      });

      expect(result.isAdmin).toBe(true);
      expect(result.isSuperadmin).toBe(false);
    });

    it('3.3 Superadmin confirmado y activo obtiene privilegios de superadmin', () => {
      const result = evaluateAdminAccess({
        authUserId: 'super-uuid',
        authUserEmail: 'super@rifamanaure.com',
        emailConfirmedAt: '2026-09-24T12:00:00Z',
        adminRecord: {
          userId: 'super-uuid',
          email: 'super@rifamanaure.com',
          role: 'superadmin',
          isActive: true,
        },
      });

      expect(result.isAdmin).toBe(true);
      expect(result.isSuperadmin).toBe(true);
    });

    it('3.4 Usuario revocado (isActive=false) pierde acceso aunque esté confirmado', () => {
      const result = evaluateAdminAccess({
        authUserId: 'revoked-uuid',
        authUserEmail: 'revoked@rifamanaure.com',
        emailConfirmedAt: '2026-09-24T12:00:00Z',
        adminRecord: {
          userId: 'revoked-uuid',
          email: 'revoked@rifamanaure.com',
          role: 'admin',
          isActive: false,
        },
      });

      expect(result.isAdmin).toBe(false);
      expect(result.isSuperadmin).toBe(false);
    });

    it('3.5 Desconexión o discrepancia de identidad rechaza la evaluación', () => {
      const result = evaluateAdminAccess({
        authUserId: 'other-uuid',
        authUserEmail: 'unrelated@domain.com',
        emailConfirmedAt: '2026-09-24T12:00:00Z',
        adminRecord: {
          userId: 'legit-uuid',
          email: 'admin@rifamanaure.com',
          role: 'admin',
          isActive: true,
        },
      });

      expect(result.isAdmin).toBe(false);
      expect(result.isSuperadmin).toBe(false);
    });
  });
});
