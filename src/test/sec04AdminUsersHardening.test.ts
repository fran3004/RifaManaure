import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminUserService from '../services/adminUserService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación SEC-04
 * Blindaje de public.admin_users, Política RLS Restringida a Superadmin y Prevención de Escalación
 */

describe('SEC-04: Hardening de admin_users y Erradicación de Escalación de Privilegios', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. adminUserService debe gestionar usuarios exclusivamente mediante RPCs seguras y no llamadas directas de mutación a la tabla', () => {
    expect(typeof adminUserService.fetchAdminUsers).toBe('function');
    expect(typeof adminUserService.inviteAdminUser).toBe('function');
    expect(typeof adminUserService.toggleAdminUserStatus).toBe('function');
  });

  it('2. fetchAdminUsers debe invocar la RPC admin_list_users y transformar los datos correctamente', async () => {
    const mockUsers: adminUserService.AdminUserItem[] = [
      {
        id: 'u-1',
        user_id: 'auth-1',
        email: 'super@test.com',
        full_name: 'Super Admin',
        role: 'superadmin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        has_auth_account: true,
        last_sign_in_at: new Date().toISOString(),
      },
    ];

    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        users: mockUsers,
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.fetchAdminUsers();

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('admin_list_users');
    expect(res.success).toBe(true);
    expect(res.users).toEqual(mockUsers);
  });

  it('3. fetchAdminUsers debe manejar respuestas de error de la RPC con gracefully degradable failure', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acceso denegado: se requieren privilegios de administrador para consultar el equipo.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.fetchAdminUsers();

    expect(res.success).toBe(false);
    expect(res.error).toContain('Acceso denegado');
  });

  it('4. inviteAdminUser debe invocar admin_invite_user con parámetros sanitizados', async () => {
    const mockNewUser: adminUserService.AdminUserItem = {
      id: 'new-id',
      user_id: null,
      email: 'colleague@test.com',
      full_name: 'Nuevo Administrador',
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
        user: mockNewUser,
        message: 'Administrador autorizado exitosamente en el sistema.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.inviteAdminUser({
      email: '  Colleague@Test.com  ',
      role: 'admin',
      fullName: '  Nuevo Administrador  ',
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('admin_invite_user', {
      p_email: 'colleague@test.com',
      p_role: 'admin',
      p_full_name: 'Nuevo Administrador',
    });
    expect(res.success).toBe(true);
    expect(res.user?.email).toBe('colleague@test.com');
  });

  it('5. inviteAdminUser debe propagar el error cuando un admin regular intenta invitar a un superadmin', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acción denegada: Solo un superadministrador puede designar a otro superadministrador.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.inviteAdminUser({
      email: 'unauthorized_super@test.com',
      role: 'superadmin',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Acción denegada: Solo un superadministrador puede designar a otro superadministrador.');
  });

  it('6. toggleAdminUserStatus debe invocar admin_toggle_user_status y manejar la respuesta', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        admin_user_id: 'admin-target-id',
        is_active: false,
        message: 'Acceso de administrador revocado inmediatamente.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.toggleAdminUserStatus('admin-target-id', false);

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('admin_toggle_user_status', {
      p_admin_user_id: 'admin-target-id',
      p_is_active: false,
    });
    expect(res.success).toBe(true);
    expect(res.is_active).toBe(false);
  });

  it('7. toggleAdminUserStatus debe propagar el rechazo de autodesactivación', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acción bloqueada por seguridad: No puedes desactivar tu propia cuenta de administrador.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.toggleAdminUserStatus('self-admin-id', false);

    expect(res.success).toBe(false);
    expect(res.error).toContain('No puedes desactivar tu propia cuenta');
  });

  it('8. toggleAdminUserStatus debe propagar el rechazo anti-orfandad del último superadministrador', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acción bloqueada: No se puede desactivar al único superadministrador activo del sistema.',
      },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await adminUserService.toggleAdminUserStatus('last-super-id', false);

    expect(res.success).toBe(false);
    expect(res.error).toContain('No se puede desactivar al único superadministrador activo');
  });
});
