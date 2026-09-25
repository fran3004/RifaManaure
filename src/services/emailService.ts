/**
 * ==============================================================================
 * SERVICIO TRANSACCIONAL DE CORREO ELECTRÓNICO (BREVO) - MANAURE VIVE
 * ==============================================================================
 * Servicio desacoplado para la preparación, codificación y despacho de
 * correos electrónicos transaccionales de RifaManaure mediante Brevo (Sendinblue).
 *
 * ARQUITECTURA DE SEGURIDAD E INTEGRIDAD:
 * 1. La invocación se realiza exclusivamente a través de la Supabase Edge Function 'send-brevo-email'.
 * 2. Cero confianza en datos financieros enviados por el cliente web: la Edge Function
 *    valida autoritativamente el estado 'paid', comprador y boletos directamente en PostgreSQL.
 * 3. El comprobante digital PNG se genera en el navegador vía Canvas con el servicio
 *    oficial (receiptGeneratorService), se codifica en Base64 limpio (sin prefijo
 *    'data:image/...'), y se adjunta con la convención de nombre oficial.
 * 4. La aprobación o rechazo financiero NUNCA depende del correo: si Brevo o la red fallan,
 *    la orden permanece con su estado financiero intacto y se registra 'failed' en notification_logs.
 * 5. Respeta estrictamente la preferencia de contacto (contact_preference):
 *    - 'whatsapp': no se despacha correo.
 *    - 'email': se despacha correo.
 *    - 'both': se despacha correo y WhatsApp.
 * ==============================================================================
 */

import { supabase } from '@/lib/supabase';
import { maskDocumentId } from '@/lib/utils';
import {
  generateDigitalReceiptCanvas,
  type DigitalReceiptData,
} from './receiptGeneratorService';
import type { ContactPreference } from '@/types/raffle.types';
import type { OrderWithDetails } from './paymentService';

export interface SendEmailPayload {
  orderId: string;
  eventType: 'payment_received' | 'payment_approved' | 'payment_rejected' | string;
  receiptPngBase64?: string;
  receiptFileName?: string;
  isRetry?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Determina si debe despacharse un correo según la preferencia de contacto registrada.
 */
export function shouldSendEmail(preference?: ContactPreference | string | null): boolean {
  if (!preference) return false;
  const clean = preference.toLowerCase().trim();
  return clean === 'email' || clean === 'both';
}

/**
 * Determina si debe despacharse una notificación por WhatsApp según la preferencia.
 */
export function shouldSendWhatsApp(preference?: ContactPreference | string | null): boolean {
  if (!preference) return true; // Por compatibilidad histórica, fallback a WhatsApp
  const clean = preference.toLowerCase().trim();
  return clean === 'whatsapp' || clean === 'both';
}

/**
 * Formatea el nombre de archivo oficial para el comprobante adjunto.
 * Ejemplo: "Comprobante_ManaureVive_MAN-2026-001.png"
 */
export function formatReceiptAttachmentFileName(orderReference: string): string {
  const cleanRef = (orderReference || '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
  return `Comprobante_ManaureVive_${cleanRef || 'orden'}.png`;
}

/**
 * Convierte un elemento HTMLCanvasElement a una cadena Base64 limpia (sin prefijo data URL).
 */
export async function convertCanvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  if (!canvas) {
    throw new Error('Canvas no válido para conversión a base64.');
  }

  // 1. toDataURL síncrono estándar
  if (typeof canvas.toDataURL === 'function') {
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/[a-z]+;base64,/, '').trim();
  }

  // 2. Fallback a toBlob y ArrayBuffer
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) {
      throw new Error('No se pudo generar el Blob del canvas.');
    }
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  throw new Error('El objeto canvas no implementa toDataURL ni toBlob.');
}

/**
 * Construye el objeto de datos necesario para el generador de comprobantes digitales
 * a partir de los datos autoritativos de la orden.
 */
export function buildDigitalReceiptDataFromOrder(
  order: OrderWithDetails,
  customRaffleTitle?: string
): DigitalReceiptData {
  const ticketNumbers = (order.tickets || []).map((t) => String(t.number));

  return {
    orderReference: order.reference,
    orderStatus: 'paid',
    createdAt: order.created_at,
    totalAmount: order.total_amount,
    ticketCount: ticketNumbers.length || order.ticket_count || 0,
    buyerName: order.buyers?.full_name || 'Comprador',
    buyerDocumentMasked: order.buyers?.document_id
      ? maskDocumentId(order.buyers.document_id)
      : '***',
    raffleTitle: customRaffleTitle || 'Sorteo Oficial Manaure Vive',
    lotteryReference: 'Lotería Oficial según cronograma',
    ticketNumbers,
    verifiedAt: order.verified_at || new Date().toISOString(),
    paymentMethod: order.payment_method || undefined,
  };
}

/**
 * Invoca de forma segura la Supabase Edge Function 'send-brevo-email'.
 * Nunca propaga excepciones que puedan romper flujos administrativos de pago.
 */
export async function sendTransactionalEmail(
  payload: SendEmailPayload
): Promise<SendEmailResult> {
  try {
    const sanitizedBase64 = payload.receiptPngBase64
      ? payload.receiptPngBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim()
      : undefined;

    const requestBody: SendEmailPayload = {
      orderId: payload.orderId,
      eventType: payload.eventType,
      receiptPngBase64: sanitizedBase64,
      receiptFileName: payload.receiptFileName,
      isRetry: payload.isRetry,
    };

    const { data, error } = await supabase.functions.invoke('send-brevo-email', {
      body: requestBody,
    });

    if (error) {
      let errorMsg = error.message;
      if ('context' in error && error.context) {
        try {
          const bodyText = await (error.context as Response).text();
          const parsed = JSON.parse(bodyText);
          if (parsed.error) errorMsg = parsed.error;
        } catch {
          // Mantener error.message si no se pudo parsear
        }
      }
      return {
        success: false,
        error: errorMsg,
      };
    }

    if (data && typeof data === 'object') {
      return {
        success: Boolean(data.success),
        messageId: data.messageId,
        error: data.error,
        skipped: Boolean(data.skipped),
      };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Error inesperado al conectar con el servicio de correo.',
    };
  }
}

/**
 * Genera el comprobante PNG digital y envía el correo oficial de confirmación
 * para una orden aprobada ('payment_approved').
 */
export async function sendPaymentApprovedEmail(
  order: OrderWithDetails,
  customReceiptData?: DigitalReceiptData,
  options?: { isRetry?: boolean }
): Promise<SendEmailResult> {
  // 1. Validar preferencia de contacto
  if (!shouldSendEmail(order.contact_preference)) {
    return {
      success: true,
      skipped: true,
    };
  }

  // 2. Generar comprobante PNG en base64
  let receiptPngBase64: string | undefined;
  let receiptFileName: string | undefined;

  try {
    const receiptData = customReceiptData || buildDigitalReceiptDataFromOrder(order);
    const canvas = await generateDigitalReceiptCanvas(receiptData);
    receiptPngBase64 = await convertCanvasToBase64(canvas);
    receiptFileName = formatReceiptAttachmentFileName(order.reference);
  } catch (canvasErr) {
    console.warn(
      'Aviso: No fue posible generar el comprobante PNG adjunto. Se enviará el correo HTML estándar.',
      canvasErr
    );
  }

  // 3. Despachar a través de la Edge Function
  return sendTransactionalEmail({
    orderId: order.id,
    eventType: 'payment_approved',
    receiptPngBase64,
    receiptFileName,
    isRetry: options?.isRetry,
  });
}

/**
 * Despacha el correo de notificación de pago rechazado ('payment_rejected').
 */
export async function sendPaymentRejectedEmail(
  orderId: string,
  contactPreference?: ContactPreference | string | null,
  options?: { isRetry?: boolean }
): Promise<SendEmailResult> {
  if (!shouldSendEmail(contactPreference)) {
    return {
      success: true,
      skipped: true,
    };
  }

  return sendTransactionalEmail({
    orderId,
    eventType: 'payment_rejected',
    isRetry: options?.isRetry,
  });
}
