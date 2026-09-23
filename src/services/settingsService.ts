import { supabase } from '@/lib/supabase';
import type {
  SystemSettingsRow,
  UpdateSystemSettingsParams,
  SystemSettingsResponse,
} from '@/types/raffle.types';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsRow = {
  id: 1,
  reservation_duration_minutes: 10,
  max_tickets_per_buyer: 20,
  support_whatsapp_number: '573001234567',
  support_email: 'soporte@manaurevive.com',
  updated_at: new Date().toISOString(),
  updated_by: null,
};

/**
 * Consulta la configuración operativa global del sistema (fila única id = 1).
 */
export async function getSystemSettings(): Promise<SystemSettingsRow> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('[settingsService] Advertencia al consultar system_settings:', error.message);
      return DEFAULT_SYSTEM_SETTINGS;
    }

    if (!data) {
      return DEFAULT_SYSTEM_SETTINGS;
    }

    return data as SystemSettingsRow;
  } catch (err) {
    console.error('[settingsService] Error de red al consultar configuración:', err);
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

function formatSettingsRpcError(rawError: string): string {
  if (!rawError) return 'Error inesperado al actualizar la configuración.';

  if (
    rawError.includes('schema cache') ||
    rawError.includes('Could not find the function') ||
    rawError.includes('admin_update_system_settings')
  ) {
    console.warn('[settingsService] RPC admin_update_system_settings no disponible:', rawError);
    return 'No fue posible actualizar la configuración del sistema. El servicio no está disponible temporalmente.';
  }

  if (rawError.includes('Acceso denegado') || rawError.includes('solo administradores')) {
    return 'Acceso denegado: tu usuario no tiene permisos de administrador activos en la tabla admin_users.';
  }

  return rawError;
}

/**
 * Actualiza los parámetros operativos del sistema mediante la RPC administrativa segura.
 */
export async function updateSystemSettingsAdmin(
  params: UpdateSystemSettingsParams
): Promise<SystemSettingsResponse> {
  try {
    // Validaciones preventivas en cliente
    if (params.reservationDurationMinutes < 1 || params.reservationDurationMinutes > 120) {
      return {
        success: false,
        error: 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.',
      };
    }

    if (params.maxTicketsPerBuyer < 1 || params.maxTicketsPerBuyer > 1000) {
      return {
        success: false,
        error: 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.',
      };
    }

    const { data, error } = await supabase.rpc('admin_update_system_settings', {
      p_reservation_duration_minutes: params.reservationDurationMinutes,
      p_max_tickets_per_buyer: params.maxTicketsPerBuyer,
      p_support_whatsapp_number: params.supportWhatsappNumber.trim(),
      p_support_email: params.supportEmail.trim().toLowerCase(),
    });

    if (error) {
      console.error('[settingsService] Error RPC al actualizar configuraciones:', error);
      return {
        success: false,
        error: formatSettingsRpcError(error.message),
      };
    }

    const response = data as {
      success: boolean;
      settings?: SystemSettingsRow;
      error?: string;
      message?: string;
    } | null;

    if (response?.success && response.settings) {
      return {
        success: true,
        settings: response.settings,
        message: response.message || 'Configuración actualizada exitosamente.',
      };
    }

    return {
      success: false,
      error: response?.error
        ? formatSettingsRpcError(response.error)
        : 'No fue posible actualizar la configuración del sistema.',
    };
  } catch (err) {
    console.error('[settingsService] Excepción al actualizar configuración:', err);
    return {
      success: false,
      error:
        err instanceof Error
          ? formatSettingsRpcError(err.message)
          : 'Error de conexión al servidor.',
    };
  }
}
