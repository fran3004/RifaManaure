/**
 * Servicio de Correo Electrónico Transaccional de "Manaure Vive"
 * 
 * ARQUITECTURA:
 * React/Vite -> Supabase Edge Function (send-transactional-email) -> Resend API -> Email Comprador
 * 
 * NOTA DE SEGURIDAD:
 * - Resend es el proveedor exclusivo de email.
 * - No contiene API keys ni secretos en frontend.
 * - Toda comunicación con Resend se ejecuta exclusivamente en backend seguro (Supabase Edge Function).
 */

import { supabase } from '@/lib/supabase';

export type EmailEventType = 'PAYMENT_RECEIVED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED';

export interface EmailSendResult {
  success: boolean;
  emailId?: string;
  status?: string;
  cached?: boolean;
  error?: string;
}

import type { Database } from '@/database.types';

export type NotificationLogRow = Database['public']['Tables']['notification_logs']['Row'];

export interface EmailProvider {
  readonly name: string;
  sendOrderEmail(
    orderId: string,
    eventType: EmailEventType,
    reason?: string,
    isRetry?: boolean
  ): Promise<EmailSendResult>;
}

/**
 * Proveedor definitivo basado en Resend mediante Supabase Edge Functions.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'Resend Transactional Email (via Supabase Edge Functions)';

  async sendOrderEmail(
    orderId: string,
    eventType: EmailEventType,
    reason?: string,
    isRetry = false
  ): Promise<EmailSendResult> {
    try {
      if (!orderId) {
        return { success: false, error: 'El identificador de la orden es obligatorio.' };
      }

      // Invocar la Edge Function segura send-transactional-email
      const { data, error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          orderId,
          eventType,
          reason,
          isRetry,
        },
      });

      if (error) {
        console.warn('Aviso al invocar Edge Function send-transactional-email:', error.message);
        return {
          success: false,
          error: error.message || 'Error al conectar con la Edge Function de correos.',
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'No se recibió respuesta del servicio de correos.',
        };
      }

      return {
        success: Boolean(data.success),
        emailId: data.emailId,
        status: data.status,
        cached: data.cached,
        error: data.error,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al enviar correo';
      return { success: false, error: msg };
    }
  }
}

// Instancia singleton del proveedor Resend
export const defaultEmailProvider: EmailProvider = new ResendEmailProvider();

/**
 * Dispara el correo de Comprobante Recibido (PAYMENT_RECEIVED)
 */
export async function sendPaymentReceivedEmail(orderId: string): Promise<EmailSendResult> {
  return defaultEmailProvider.sendOrderEmail(orderId, 'PAYMENT_RECEIVED');
}

/**
 * Dispara el correo de Pago Aprobado y Confirmado (PAYMENT_APPROVED)
 */
export async function sendPaymentApprovedEmail(orderId: string): Promise<EmailSendResult> {
  return defaultEmailProvider.sendOrderEmail(orderId, 'PAYMENT_APPROVED');
}

/**
 * Dispara el correo de Pago Rechazado (PAYMENT_REJECTED)
 */
export async function sendPaymentRejectedEmail(
  orderId: string,
  reason?: string
): Promise<EmailSendResult> {
  return defaultEmailProvider.sendOrderEmail(orderId, 'PAYMENT_REJECTED', reason);
}

/**
 * Reintenta el envío de un correo transaccional fallido sin alterar la orden ni los tickets.
 */
export async function retryOrderEmail(
  orderId: string,
  eventType: EmailEventType,
  reason?: string
): Promise<EmailSendResult> {
  return defaultEmailProvider.sendOrderEmail(orderId, eventType, reason, true);
}

/**
 * Consulta el historial de logs de notificaciones por email de una orden específica.
 */
export async function getOrderEmailLogs(orderId: string): Promise<NotificationLogRow[]> {
  try {
    const { data, error } = await supabase
      .from('notification_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data as NotificationLogRow[];
  } catch (err) {
    console.warn('Aviso al consultar notification_logs:', err);
    return [];
  }
}

