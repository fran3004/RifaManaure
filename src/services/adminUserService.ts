import { supabase } from '@/lib/supabase';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';

export interface AdminUserItem {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: 'superadmin' | 'admin' | 'auditor';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  has_auth_account: boolean;
  last_sign_in_at: string | null;
}

export interface AdminUsersResponse {
  success: boolean;
  users?: AdminUserItem[];
  error?: string;
}

export interface InviteAdminUserParams {
  email: string;
  role: 'superadmin' | 'admin' | 'auditor';
  fullName?: string;
  redirectTo?: string;
}

export interface InviteAdminUserResponse {
  success: boolean;
  user?: AdminUserItem;
  message?: string;
  error?: string;
  emailSent?: boolean;
  userAlreadyExists?: boolean;
  warning?: string;
}

export interface ToggleAdminUserStatusResponse {
  success: boolean;
  admin_user_id?: string;
  is_active?: boolean;
  message?: string;
  error?: string;
}

/**
 * Consulta la lista oficial de administradores registrados mediante RPC segura.
 */
export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  try {
    const { data, error } = await supabase.rpc('admin_list_users');

    if (error) {
      const normalized = normalizeAppError(error, 'Error al obtener la lista de administradores.');
      logAppError('adminUserService.fetchAdminUsers.rpc', normalized);
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    const payload = data as unknown as AdminUsersResponse;

    if (!payload?.success) {
      const normalized = normalizeAppError(
        { message: payload?.error },
        'No fue posible consultar los administradores.'
      );
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    return {
      success: true,
      users: payload.users || [],
    };
  } catch (err) {
    const normalized = normalizeAppError(err, 'Error inesperado de red al consultar administradores.');
    logAppError('adminUserService.fetchAdminUsers.catch', normalized);
    return {
      success: false,
      error: normalized.userMessage,
    };
  }
}

/**
 * Invita / pre-autoriza a un nuevo administrador en el sistema.
 * Intenta enviar el correo de invitación oficial de Supabase Auth mediante Edge Function,
 * con fallback resiliente a la RPC de base de datos admin_invite_user.
 */
export async function inviteAdminUser(
  params: InviteAdminUserParams
): Promise<InviteAdminUserResponse> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.fullName ? params.fullName.trim() : null;
  const defaultRedirect =
    typeof window !== 'undefined'
      ? `${window.location.origin}/admin/set-password`
      : 'https://rifa-manaure.vercel.app/admin/set-password';
  const targetRedirectTo = params.redirectTo || defaultRedirect;

  try {
    // 1. Intentar invocar la Edge Function para pre-autorizar y enviar correo de invitación
    const { data: funcData, error: funcError } = await supabase.functions.invoke(
      'admin-invite-user',
      {
        body: {
          email: cleanEmail,
          role: params.role,
          fullName: cleanName,
          redirectTo: targetRedirectTo,
        },
      }
    );

    // Si la Edge Function respondió exitosamente
    if (!funcError && funcData && typeof funcData === 'object' && 'success' in funcData) {
      const payload = funcData as InviteAdminUserResponse;
      if (payload.success) {
        return {
          success: true,
          user: payload.user,
          emailSent: Boolean(payload.emailSent),
          userAlreadyExists: Boolean(payload.userAlreadyExists),
          warning: payload.warning,
          message: payload.message || 'Administrador autorizado exitosamente.',
        };
      } else if (payload.error) {
        return {
          success: false,
          error: payload.error,
        };
      }
    }

    // 2. Si la Edge Function no está desplegada o responde con error de infraestructura,
    // aplicar fallback resiliente a la RPC directa de PostgreSQL (pre-autorización estándar)
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_invite_user', {
      p_email: cleanEmail,
      p_role: params.role,
      p_full_name: cleanName,
    });

    if (rpcError) {
      const normalized = normalizeAppError(rpcError, 'Error al invitar al administrador.');
      logAppError('adminUserService.inviteAdminUser.rpc', normalized);
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    const rpcPayload = rpcData as unknown as InviteAdminUserResponse;

    if (!rpcPayload?.success) {
      const normalized = normalizeAppError(
        { message: rpcPayload?.error },
        'No se pudo autorizar al nuevo administrador.'
      );
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    return {
      success: true,
      user: rpcPayload.user,
      emailSent: false, // Fallback sin envío de correo
      message:
        rpcPayload.message ||
        'Administrador pre-autorizado exitosamente. Comparte el enlace de acceso manualmente.',
    };
  } catch (err) {
    const normalized = normalizeAppError(err, 'Error inesperado de red al invitar administrador.');
    logAppError('adminUserService.inviteAdminUser.catch', normalized);
    return {
      success: false,
      error: normalized.userMessage,
    };
  }
}

/**
 * Activa o desactiva el acceso de un administrador en el sistema.
 */
export async function toggleAdminUserStatus(
  adminUserId: string,
  isActive: boolean
): Promise<ToggleAdminUserStatusResponse> {
  try {
    const { data, error } = await supabase.rpc('admin_toggle_user_status', {
      p_admin_user_id: adminUserId,
      p_is_active: isActive,
    });

    if (error) {
      const normalized = normalizeAppError(error, 'Error al modificar el estado del administrador.');
      logAppError('adminUserService.toggleAdminUserStatus.rpc', normalized);
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    const payload = data as unknown as ToggleAdminUserStatusResponse;

    if (!payload?.success) {
      const normalized = normalizeAppError(
        { message: payload?.error },
        'No fue posible actualizar el estado del administrador.'
      );
      return {
        success: false,
        error: normalized.userMessage,
      };
    }

    return {
      success: true,
      admin_user_id: payload.admin_user_id,
      is_active: payload.is_active,
      message: payload.message,
    };
  } catch (err) {
    const normalized = normalizeAppError(err, 'Error inesperado de red al cambiar estado de administrador.');
    logAppError('adminUserService.toggleAdminUserStatus.catch', normalized);
    return {
      success: false,
      error: normalized.userMessage,
    };
  }
}
