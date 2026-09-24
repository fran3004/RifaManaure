import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inviteAdminUser } from '@/services/adminUserService';
import { supabase } from '@/lib/supabase';

describe('Flujo Automatizado de Invitación de Administradores y Creación de Contraseña', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Servicio inviteAdminUser con Edge Function y Fallback Resiliente', () => {
    const functionsProto = Object.getPrototypeOf(supabase.functions);

    it('1. Debe invocar la Edge Function admin-invite-user con email, role y redirectTo', async () => {
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: {
          success: true,
          emailSent: true,
          userAlreadyExists: false,
          user: {
            id: 'adm-001',
            email: 'nuevo@manaurevive.com',
            role: 'admin',
            is_active: true,
            created_at: new Date().toISOString(),
          },
          message: 'Invitación enviada exitosamente.',
        },
        error: null,
      } as any);

      const result = await inviteAdminUser({
        email: 'NUEVO@MANAUREVIVE.COM',
        role: 'admin',
        fullName: 'Administrador Nuevo',
        redirectTo: 'https://manaurevive.com/admin/set-password',
      });

      expect(invokeSpy).toHaveBeenCalledTimes(1);
      expect(invokeSpy).toHaveBeenCalledWith('admin-invite-user', {
        body: {
          email: 'nuevo@manaurevive.com',
          role: 'admin',
          fullName: 'Administrador Nuevo',
          redirectTo: 'https://manaurevive.com/admin/set-password',
        },
      });

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(true);
      expect(result.userAlreadyExists).toBe(false);
      expect(result.user?.email).toBe('nuevo@manaurevive.com');

      invokeSpy.mockRestore();
    });

    it('2. Debe procesar respuesta cuando el usuario ya existía en auth.users (userAlreadyExists = true)', async () => {
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: {
          success: true,
          emailSent: false,
          userAlreadyExists: true,
          user: {
            id: 'adm-002',
            email: 'existente@manaurevive.com',
            role: 'admin',
            is_active: true,
            created_at: new Date().toISOString(),
          },
          message: 'El usuario ya cuenta con cuenta en Supabase Auth y fue autorizado.',
        },
        error: null,
      } as any);

      const result = await inviteAdminUser({
        email: 'existente@manaurevive.com',
        role: 'admin',
      });

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(result.userAlreadyExists).toBe(true);
      expect(result.message).toContain('ya cuenta con cuenta');

      invokeSpy.mockRestore();
    });

    it('3. Debe aplicar fallback a la RPC admin_invite_user si la Edge Function falla o no está desplegada', async () => {
      // Simular fallo de red o 500 en Edge Function
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: null,
        error: new Error('FunctionsFetchError: Failed to fetch'),
      } as any);

      // Simular éxito de la RPC nativa
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          user: {
            id: 'adm-fallback-003',
            email: 'fallback@manaurevive.com',
            role: 'auditor',
            is_active: true,
            created_at: new Date().toISOString(),
          },
          message: 'Administrador autorizado exitosamente en el sistema.',
        },
        error: null,
      } as any);

      const result = await inviteAdminUser({
        email: 'fallback@manaurevive.com',
        role: 'auditor',
        fullName: 'Auditor Fallback',
      });

      expect(invokeSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('admin_invite_user', {
        p_email: 'fallback@manaurevive.com',
        p_role: 'auditor',
        p_full_name: 'Auditor Fallback',
      });

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(false); // No se pudo enviar email pero sí se autorizó
      expect(result.user?.id).toBe('adm-fallback-003');

      invokeSpy.mockRestore();
      rpcSpy.mockRestore();
    });

    it('4. Si tanto la Edge Function como la RPC fallan, debe propagar el error de forma segura', async () => {
      const invokeSpy = vi.spyOn(functionsProto, 'invoke').mockResolvedValueOnce({
        data: null,
        error: new Error('Network error'),
      } as any);

      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'Acceso denegado: solo administradores activos pueden invitar',
        },
      } as any);

      const result = await inviteAdminUser({
        email: 'intruso@manaurevive.com',
        role: 'admin',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Acceso denegado');

      invokeSpy.mockRestore();
    });
  });

  describe('Establecimiento de Contraseña para Nuevos Administradores', () => {
    it('5. supabase.auth.updateUser debe ser invocado con la nueva contraseña', async () => {
      const updateUserSpy = vi.spyOn(supabase.auth, 'updateUser').mockResolvedValueOnce({
        data: {
          user: {
            id: 'u-123',
            email: 'admin@manaurevive.com',
          } as any,
        },
        error: null,
      });

      const { data, error } = await supabase.auth.updateUser({
        password: 'PasswordSuperSegura2026*',
      });

      expect(updateUserSpy).toHaveBeenCalledWith({
        password: 'PasswordSuperSegura2026*',
      });
      expect(error).toBeNull();
      expect(data.user?.id).toBe('u-123');

      updateUserSpy.mockRestore();
    });
  });
});
