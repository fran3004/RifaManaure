import { supabase } from '@/lib/supabase';

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
}

export interface InviteAdminUserResponse {
  success: boolean;
  user?: AdminUserItem;
  message?: string;
  error?: string;
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
      console.error('Error al invocar admin_list_users:', error);
      return {
        success: false,
        error: error.message || 'Error al obtener la lista de administradores.',
      };
    }

    const payload = data as unknown as AdminUsersResponse;

    if (!payload?.success) {
      return {
        success: false,
        error: payload?.error || 'No fue posible consultar los administradores.',
      };
    }

    return {
      success: true,
      users: payload.users || [],
    };
  } catch (err) {
    console.error('Error inesperado en fetchAdminUsers:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado de red.',
    };
  }
}

/**
 * Invita / pre-autoriza a un nuevo administrador en el sistema.
 */
export async function inviteAdminUser(
  params: InviteAdminUserParams
): Promise<InviteAdminUserResponse> {
  try {
    const { data, error } = await supabase.rpc('admin_invite_user', {
      p_email: params.email.trim().toLowerCase(),
      p_role: params.role,
      p_full_name: params.fullName ? params.fullName.trim() : null,
    });

    if (error) {
      console.error('Error al invocar admin_invite_user:', error);
      return {
        success: false,
        error: error.message || 'Error al invitar al administrador.',
      };
    }

    const payload = data as unknown as InviteAdminUserResponse;

    if (!payload?.success) {
      return {
        success: false,
        error: payload?.error || 'No se pudo autorizar al nuevo administrador.',
      };
    }

    return {
      success: true,
      user: payload.user,
      message: payload.message || 'Administrador autorizado exitosamente.',
    };
  } catch (err) {
    console.error('Error inesperado en inviteAdminUser:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado de red.',
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
      console.error('Error al invocar admin_toggle_user_status:', error);
      return {
        success: false,
        error: error.message || 'Error al modificar el estado del administrador.',
      };
    }

    const payload = data as unknown as ToggleAdminUserStatusResponse;

    if (!payload?.success) {
      return {
        success: false,
        error: payload?.error || 'No fue posible actualizar el estado del administrador.',
      };
    }

    return {
      success: true,
      admin_user_id: payload.admin_user_id,
      is_active: payload.is_active,
      message: payload.message,
    };
  } catch (err) {
    console.error('Error inesperado en toggleAdminUserStatus:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado de red.',
    };
  }
}
