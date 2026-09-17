import { supabase } from '@/lib/supabase';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export type AdminUserRow = Database['public']['Tables']['admin_users']['Row'];

export interface AdminAuthResult {
  user: User | null;
  session: Session | null;
  adminProfile: AdminUserRow | null;
  isAdmin: boolean;
  error?: string;
}

/**
 * Inicia sesión administrativa mediante Supabase Auth.
 */
export async function signInAdmin(email: string, password: string): Promise<AdminAuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      return {
        user: null,
        session: null,
        adminProfile: null,
        isAdmin: false,
        error: error ? translateAuthError(error) : 'Credenciales inválidas',
      };
    }

    // Verificar si el usuario autenticado está autorizado en admin_users y está activo
    const adminProfile = await checkAdminAuthorization(data.user.id, data.user.email || '');

    if (!adminProfile) {
      return {
        user: data.user,
        session: data.session,
        adminProfile: null,
        isAdmin: false,
        error: 'Acceso denegado: Tu cuenta no tiene permisos de administrador activos.',
      };
    }

    return {
      user: data.user,
      session: data.session,
      adminProfile,
      isAdmin: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado durante la autenticación';
    return {
      user: null,
      session: null,
      adminProfile: null,
      isAdmin: false,
      error: msg,
    };
  }
}

/**
 * Cierra la sesión activa de Supabase Auth.
 */
export async function signOutAdmin(): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    return {};
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cerrar sesión';
    return { error: msg };
  }
}

/**
 * Recupera la sesión actual de Supabase Auth y verifica el perfil de administrador.
 */
export async function getInitialAdminSession(): Promise<AdminAuthResult> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return {
        user: null,
        session: null,
        adminProfile: null,
        isAdmin: false,
      };
    }

    const adminProfile = await checkAdminAuthorization(session.user.id, session.user.email || '');

    return {
      user: session.user,
      session,
      adminProfile,
      isAdmin: Boolean(adminProfile && adminProfile.is_active),
    };
  } catch (err) {
    console.error('Error al recuperar sesión administrativa:', err);
    return {
      user: null,
      session: null,
      adminProfile: null,
      isAdmin: false,
    };
  }
}

/**
 * Consulta la tabla admin_users para comprobar si el usuario es administrador autorizado y activo.
 */
export async function checkAdminAuthorization(
  userId: string,
  email: string
): Promise<AdminUserRow | null> {
  try {
    const cleanEmail = email.trim().toLowerCase();

    // Consultar por user_id o por correo electrónico
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .or(`user_id.eq.${userId},email.eq.${cleanEmail}`)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error al verificar autorización de administrador:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    const row = data as AdminUserRow;

    // Si el user_id no estaba enlazado aún, enlazarlo
    if (!row.user_id && userId) {
      await supabase
        .from('admin_users')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }

    return row;
  } catch (err) {
    console.error('Error de red al verificar admin_users:', err);
    return null;
  }
}

/**
 * Traduce errores de Supabase Auth al español.
 */
function translateAuthError(error: AuthError): string {
  if (error.message.includes('Invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (error.message.includes('Email not confirmed')) {
    return 'El correo electrónico no ha sido confirmado aún en Supabase.';
  }
  if (error.message.includes('Too many requests')) {
    return 'Demasiados intentos fallidos. Por favor espera unos minutos.';
  }
  return error.message || 'Error al iniciar sesión.';
}

