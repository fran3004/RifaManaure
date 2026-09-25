/**
 * Servicio desacoplado para la generación, despacho y trazabilidad de notificaciones de órdenes.
 *
 * Canales soportados:
 * - whatsapp
 * - email
 *
 * Tipos soportados:
 * - payment_received
 * - payment_approved
 * - payment_rejected
 *
 * Estados soportados:
 * - pending
 * - sent
 * - failed
 */

import { supabase } from '@/lib/supabase';
import { formatCOP, formatTicketNumber, maskEmail } from '@/lib/utils';
export { maskEmail };
import { createWhatsAppLink, getWhatsAppProvider, type WhatsAppSendResult } from './whatsappService';
import { sendTransactionalEmail } from './emailService';
import type { ContactPreference } from '@/types/raffle.types';
import type { Database, Json } from '@/database.types';

export type NotificationLogRow = Database['public']['Tables']['notification_logs']['Row'];

/**
 * Canales de notificación soportados por la plataforma.
 * Mapea directamente a los canales válidos en la tabla notification_logs.
 */
export type NotificationChannel = 'whatsapp' | 'email';

/**
 * Proveedores transaccionales de notificación soportados por la plataforma.
 * 'brevo': Correo electrónico transaccional automatizado.
 * 'manual': WhatsApp manual gestionado por el administrador.
 */
export type NotificationProvider = 'brevo' | 'manual';

/**
 * Contrato canónico de tipos de eventos de notificación (estricto en minúsculas).
 */
export const NOTIFICATION_EVENT_TYPES = {
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_APPROVED: 'payment_approved',
  PAYMENT_REJECTED: 'payment_rejected',
} as const;

export type NotificationEventType =
  (typeof NOTIFICATION_EVENT_TYPES)[keyof typeof NOTIFICATION_EVENT_TYPES];

/**
 * Tipo de entrada flexible para permitir compatibilidad histórica durante la transición.
 */
export type NotificationEventInputType =
  | NotificationEventType
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | string;

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'delivered' | 'bounced';

export interface OrderNotificationData {
  reference: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  ticketNumbers: (string | number)[];
  totalAmount: number;
  raffleTitle?: string;
  drawDate?: string;
  rejectionReason?: string;
  supportPhone?: string;
  verifyUrl?: string;
}

export type NotificationType = 'receipt_received' | 'payment_approved' | 'payment_rejected';

export interface GeneratedNotification {
  type: NotificationType;
  title: string;
  messageText: string;
  whatsAppLink: string;
  targetPhone: string;
  isApiConfigured: boolean;
  sendDirectly?: () => Promise<WhatsAppSendResult>;
}

export interface DispatchNotificationOptions {
  orderId: string;
  contactPreference?: ContactPreference | string;
  eventType: NotificationEventInputType;
  notificationData: OrderNotificationData;
  receiptPngBase64?: string;
  receiptFileName?: string;
  skipEmail?: boolean;
}

export interface DispatchNotificationResult {
  contactPreference: ContactPreference | string;
  whatsappDispatched: boolean;
  whatsappNotification?: GeneratedNotification;
  emailDispatched: boolean;
}

export interface RecordNotificationLogInput {
  orderId: string;
  channel: NotificationChannel;
  eventType: NotificationEventInputType;
  recipient: string;
  status: NotificationStatus;
  errorMessage?: string | null;
  attempts?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  provider?: NotificationProvider | null;
  providerMessageId?: string | null;
  lastAttemptAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
}

const DEFAULT_SUPPORT_CONTACT = 'Equipo de Atención y Soporte Rifa Manaure';
const DEFAULT_RAFFLE_TITLE = 'Gran Rifa Manaure Balcón del Cesar';

/**
 * Normaliza cualquier variante de nombre de evento al contrato canónico en minúsculas.
 * Punto único y centralizado de normalización del sistema para garantizar consistencia.
 */
export function normalizeEventType(eventType: string): NotificationEventType {
  const clean = (eventType || '').trim().toLowerCase();
  if (clean.includes('approved')) return NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED;
  if (clean.includes('rejected')) return NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED;
  return NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED;
}

/**
 * Construye una clave idempotente canónica, determinista y sin marcas temporales:
 * Formato: {channel}:{eventType}:{orderId}
 * Ejemplo: email:payment_approved:{orderId}
 */
export function buildNotificationIdempotencyKey(
  channel: NotificationChannel | string,
  eventType: NotificationEventInputType,
  orderId: string
): string {
  const normChannel = (channel || 'email').trim().toLowerCase();
  const normEvent = normalizeEventType(eventType);
  return `${normChannel}:${normEvent}:${orderId.trim()}`;
}

/**
 * Registra o actualiza una entrada de trazabilidad en la tabla notification_logs.
 * Protege estrictamente la privacidad omitiendo cualquier dato sensible.
 */
export async function recordNotificationLog(
  input: RecordNotificationLogInput
): Promise<NotificationLogRow | null> {
  try {
    const normalizedType = normalizeEventType(input.eventType);
    const key =
      input.idempotencyKey ||
      buildNotificationIdempotencyKey(input.channel, normalizedType, input.orderId);

    const { data: existing } = await supabase
      .from('notification_logs')
      .select('id, attempts, provider, provider_message_id, delivered_at, failed_at')
      .eq('idempotency_key', key)
      .maybeSingle();

    const attempts = input.attempts || (existing ? (existing.attempts || 1) + 1 : 1);
    const nowIso = new Date().toISOString();

    const provider: NotificationProvider =
      input.provider ?? (input.channel === 'email' ? 'brevo' : 'manual');

    // Para WhatsApp manual NUNCA se inventa messageId. Para email se toma de providerMessageId o metadata.
    const providerMessageId =
      input.channel === 'email'
        ? input.providerMessageId ||
          (input.metadata as Record<string, any>)?.messageId ||
          (input.metadata as Record<string, any>)?.message_id ||
          existing?.provider_message_id ||
          null
        : null;

    const lastAttemptAt = input.lastAttemptAt || nowIso;
    const deliveredAt =
      input.deliveredAt ||
      (input.status === 'delivered' ? nowIso : existing?.delivered_at || null);
    const failedAt =
      input.failedAt ||
      (input.status === 'failed' || input.status === 'bounced'
        ? nowIso
        : existing?.failed_at || null);

    const { data, error } = await supabase
      .from('notification_logs')
      .upsert(
        {
          order_id: input.orderId,
          channel: input.channel,
          event_type: normalizedType,
          recipient: input.recipient || 'N/A',
          status: input.status,
          error_message: input.errorMessage || null,
          attempts,
          idempotency_key: key,
          provider,
          provider_message_id: providerMessageId,
          last_attempt_at: lastAttemptAt,
          delivered_at: deliveredAt,
          failed_at: failedAt,
          metadata: (input.metadata as Json) || null,
          updated_at: nowIso,
        },
        { onConflict: 'idempotency_key' }
      )
      .select('*')
      .single();

    if (error) {
      console.warn('Aviso al registrar log de notificación en Supabase:', error.message);
      return null;
    }

    return data as NotificationLogRow;
  } catch (err) {
    console.warn('Error al guardar log de notificación:', err);
    return null;
  }
}

/**
 * Obtiene el historial completo de trazabilidad de notificaciones (WhatsApp y Email) de una orden.
 */
export async function getOrderNotificationLogs(orderId: string): Promise<NotificationLogRow[]> {
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
    console.warn('Error al consultar notification_logs:', err);
    return [];
  }
}

/**
 * 1. Plantilla: COMPROBANTE RECIBIDO (Tu pedido ha sido recibido / Pendiente de verificación)
 */
export function buildReceiptReceivedMessage(data: OrderNotificationData): string {
  const formattedTickets = data.ticketNumbers.map((n) => formatTicketNumber(n)).join(', ');
  const verifyLink =
    data.verifyUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar');

  return (
    `¡Hola ${data.buyerName}! 👋\n\n` +
    `Hemos recibido tu comprobante de pago para la orden *${data.reference}*.\n\n` +
    `📋 *Resumen de tu solicitud:*\n` +
    `• Sorteo: ${data.raffleTitle || DEFAULT_RAFFLE_TITLE}\n` +
    `• Boletos reservados: *${formattedTickets}*\n` +
    `• Total a verificar: *${formatCOP(data.totalAmount)}*\n` +
    `• Estado: ⏳ *Pendiente de verificación manual*\n\n` +
    `Nuestro equipo administrativo validará la transferencia en cuenta bancaria. Una vez confirmada, recibirás la confirmación oficial definitiva.\n\n` +
    `🔍 Puedes consultar el estado en cualquier momento aquí:\n` +
    `${verifyLink}\n\n` +
    `¡Gracias por tu participación!`
  );
}

/**
 * 2. Plantilla: PAGO APROBADO (Venta confirmada de boletos)
 */
export function buildPaymentApprovedMessage(data: OrderNotificationData): string {
  const formattedTickets = data.ticketNumbers.map((n) => formatTicketNumber(n)).join(', ');
  const verifyLink =
    data.verifyUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar');

  let message =
    `¡Hola ${data.buyerName}! 👋\n\n` +
    `🎉 *¡TU PAGO HA SIDO APROBADO CON ÉXITO!* 🎉\n\n` +
    `Tu compra ha sido verificada y tus boletos están oficialmente confirmados.\n\n` +
    `📋 *Detalles oficiales de la compra:*\n` +
    `• Sorteo: *${data.raffleTitle || DEFAULT_RAFFLE_TITLE}*\n` +
    `• Referencia de orden: *${data.reference}*\n` +
    `• Boletos adquiridos: *${formattedTickets}*\n` +
    `• Total pagado: *${formatCOP(data.totalAmount)}*\n` +
    `• Estado: ✅ *Pagado y Confirmado*\n`;

  if (data.drawDate) {
    message += `• Fecha del sorteo: ${data.drawDate}\n`;
  }

  message +=
    `\n🔍 Puedes consultar y validar tus números oficiales en la sección «Consultar Boletos»:\n` +
    `${verifyLink}\n\n` +
    `📞 Soporte: ${data.supportPhone || DEFAULT_SUPPORT_CONTACT}\n\n` +
    `¡Te deseamos mucha suerte en el sorteo! 🍀✨`;

  return message;
}

/**
 * 3. Plantilla: PAGO RECHAZADO (Comprobante no válido / Boletos liberados)
 */
export function buildPaymentRejectedMessage(data: OrderNotificationData): string {
  const reason =
    data.rejectionReason?.trim() ||
    'Comprobante no legible o no coincide con los valores en cuenta.';

  return (
    `Hola ${data.buyerName}.\n\n` +
    `Te contactamos respecto a tu solicitud de compra con orden *${data.reference}* en ${data.raffleTitle || DEFAULT_RAFFLE_TITLE}.\n\n` +
    `❌ *No fue posible aprobar tu comprobante de pago.*\n\n` +
    `📌 *Motivo informado:* ${reason}\n\n` +
    `⚠️ Los boletos que tenías en reserva temporal han sido liberados.\n\n` +
    `Si consideras que se trata de un error o deseas suministrar un nuevo soporte de transferencia, por favor comunícate directamente con nuestro equipo de atención respondiendo a este mensaje o a través de nuestros canales oficiales.\n\n` +
    `Atentamente,\n` +
    `${data.supportPhone || DEFAULT_SUPPORT_CONTACT}`
  );
}

/**
 * Genera el paquete completo de notificación con texto formateado, enlace wa.me y método de envío.
 */
export function generateOrderNotification(
  type: NotificationType,
  data: OrderNotificationData,
  providerId = 'manual'
): GeneratedNotification {
  let messageText = '';
  let title = '';

  switch (type) {
    case 'receipt_received':
      title = 'Comprobante en Verificación';
      messageText = buildReceiptReceivedMessage(data);
      break;
    case 'payment_approved':
      title = 'Confirmación de Pago Aprobado';
      messageText = buildPaymentApprovedMessage(data);
      break;
    case 'payment_rejected':
      title = 'Notificación de Pago Rechazado';
      messageText = buildPaymentRejectedMessage(data);
      break;
  }

  const provider = getWhatsAppProvider(providerId);
  const whatsAppLink = createWhatsAppLink(data.buyerPhone, messageText);
  const isApiConfigured =
    provider.isConfigured() && typeof provider.sendDirectMessage === 'function';

  return {
    type,
    title,
    messageText,
    whatsAppLink,
    targetPhone: data.buyerPhone,
    isApiConfigured,
    sendDirectly:
      isApiConfigured && provider.sendDirectMessage
        ? () => provider.sendDirectMessage!(data.buyerPhone, messageText)
        : undefined,
  };
}

/**
 * Orquestador central de notificaciones:
 * Dispara notificaciones según la preferencia de contacto registrada por el comprador (whatsapp, email, both).
 *
 * REGLA CRÍTICA:
 * Si el envío de correo o WhatsApp falla, NUNCA revierte la transacción de venta en base de datos.
 * Registra el resultado en notification_logs para trazabilidad y permite reintento posterior.
 */
export async function dispatchOrderNotifications(
  options: DispatchNotificationOptions
): Promise<DispatchNotificationResult> {
  const preference: ContactPreference =
    options.contactPreference === 'email' || options.contactPreference === 'both'
      ? options.contactPreference
      : 'whatsapp';
  const normalizedType = normalizeEventType(options.eventType);
  let whatsappNotification: GeneratedNotification | undefined;
  let whatsappDispatched = false;
  let emailDispatched = false;

  const shouldSendWhatsApp = preference === 'whatsapp' || preference === 'both';
  const shouldSendEmail = preference === 'email' || preference === 'both';

  const typeMapping: Record<NotificationEventType, NotificationType> = {
    payment_received: 'receipt_received',
    payment_approved: 'payment_approved',
    payment_rejected: 'payment_rejected',
  };

  if (shouldSendWhatsApp) {
    whatsappNotification = generateOrderNotification(
      typeMapping[normalizedType],
      options.notificationData
    );

    const hasPhone = Boolean(
      options.notificationData.buyerPhone && options.notificationData.buyerPhone.trim().length >= 7
    );

    // Registrar en trazabilidad la preparación de la plantilla de WhatsApp (CANAL MANUAL)
    void recordNotificationLog({
      orderId: options.orderId,
      channel: 'whatsapp',
      eventType: normalizedType,
      recipient: options.notificationData.buyerPhone || 'Sin teléfono',
      status: hasPhone ? 'pending' : 'failed',
      errorMessage: hasPhone
        ? null
        : 'El comprador no tiene un número de celular válido registrado para WhatsApp.',
      attempts: 1,
      provider: 'manual',
      providerMessageId: null,
      metadata: {
        manual: true,
        stage: hasPhone ? 'prepared' : 'failed',
        delivery_type: 'manual_whatsapp',
        buyer_name: options.notificationData.buyerName,
        reference: options.notificationData.reference,
        tickets_count: options.notificationData.ticketNumbers.length,
      },
    });

    whatsappDispatched = hasPhone;
  }

  if (shouldSendEmail && !options.skipEmail) {
    try {
      const emailResult = await sendTransactionalEmail({
        orderId: options.orderId,
        eventType: normalizedType,
        receiptPngBase64: options.receiptPngBase64,
        receiptFileName: options.receiptFileName,
      });
      emailDispatched = emailResult.success;
    } catch (emailErr) {
      console.warn('Error al despachar correo transaccional en notificationService:', emailErr);
      emailDispatched = false;
    }
  }

  return {
    contactPreference: preference,
    whatsappDispatched,
    whatsappNotification,
    emailDispatched,
  };
}

/**
 * Registra en trazabilidad que el enlace de WhatsApp fue abierto para envío manual.
 */
export async function recordWhatsAppOpened(
  orderId: string,
  eventType: NotificationEventType | string,
  recipient: string
): Promise<NotificationLogRow | null> {
  const normalizedType = normalizeEventType(eventType);
  return recordNotificationLog({
    orderId,
    channel: 'whatsapp',
    eventType: normalizedType,
    recipient: recipient || 'N/A',
    status: 'pending',
    errorMessage: null,
    provider: 'manual',
    providerMessageId: null,
    metadata: {
      manual: true,
      stage: 'opened',
      delivery_type: 'manual_whatsapp',
      opened_at: new Date().toISOString(),
    },
  });
}

/**
 * Registra en trazabilidad que el administrador confirmó haber enviado el mensaje manualmente.
 */
export async function recordWhatsAppSentManually(
  orderId: string,
  eventType: NotificationEventType | string,
  recipient: string
): Promise<NotificationLogRow | null> {
  const normalizedType = normalizeEventType(eventType);
  return recordNotificationLog({
    orderId,
    channel: 'whatsapp',
    eventType: normalizedType,
    recipient: recipient || 'N/A',
    status: 'pending',
    errorMessage: null,
    provider: 'manual',
    providerMessageId: null,
    metadata: {
      manual: true,
      stage: 'sent_manually',
      delivery_type: 'manual_whatsapp',
      confirmed_at: new Date().toISOString(),
    },
  });
}

/**
 * Retorna la etiqueta y estilo verídico para un registro de notificación.
 * Evita rotundamente afirmar "Enviada" en WhatsApp salvo confirmación manual.
 */
export function getNotificationStatusBadge(log: {
  channel: string;
  status: string;
  metadata?: unknown;
}): {
  label: string;
  variant: 'success' | 'warning' | 'info' | 'danger';
  stage?: 'prepared' | 'opened' | 'sent_manually';
  isManualWhatsApp?: boolean;
} {
  const isWhatsApp = log.channel === 'whatsapp';
  const meta = (typeof log.metadata === 'object' && log.metadata !== null ? log.metadata : {}) as Record<string, any>;
  const stage = meta?.stage;

  if (isWhatsApp) {
    if (log.status === 'failed') {
      return { label: 'Teléfono no válido', variant: 'danger', isManualWhatsApp: true };
    }
    if (stage === 'sent_manually') {
      return { label: 'Enviado manualmente', variant: 'success', stage: 'sent_manually', isManualWhatsApp: true };
    }
    if (stage === 'opened') {
      return { label: 'WhatsApp abierto', variant: 'info', stage: 'opened', isManualWhatsApp: true };
    }
    // Por defecto para canal manual WhatsApp
    return { label: 'Plantilla preparada', variant: 'warning', stage: 'prepared', isManualWhatsApp: true };
  }

  // Canal Correo (Brevo)
  if (log.status === 'sent' || log.status === 'delivered') {
    return { label: 'Enviada (Brevo)', variant: 'success' };
  }
  if (log.status === 'failed') {
    return { label: 'Falló el envío', variant: 'danger' };
  }
  return { label: 'Pendiente', variant: 'warning' };
}

/**
 * Reintenta una notificación específica (WhatsApp o Correo) y actualiza la trazabilidad.
 */
export async function retryNotification(
  orderId: string,
  channel: NotificationChannel,
  eventType: NotificationEventType | string,
  data?: {
    buyerPhone?: string;
    buyerEmail?: string;
    buyerName?: string;
    orderReference?: string;
    reason?: string;
    receiptPngBase64?: string;
    receiptFileName?: string;
  }
): Promise<{ success: boolean; error?: string; whatsAppLink?: string }> {
  const normalizedType = normalizeEventType(eventType);

  if (channel === 'whatsapp') {
    const phone = data?.buyerPhone || '';
    if (!phone) {
      await recordNotificationLog({
        orderId,
        channel: 'whatsapp',
        eventType: normalizedType,
        recipient: 'N/A',
        status: 'failed',
        errorMessage: 'Teléfono no disponible para reintento de WhatsApp',
      });
      return { success: false, error: 'No se encontró el número de WhatsApp del comprador.' };
    }

    const typeMapping: Record<NotificationEventType, NotificationType> = {
      payment_received: 'receipt_received',
      payment_approved: 'payment_approved',
      payment_rejected: 'payment_rejected',
    };

    const notif = generateOrderNotification(typeMapping[normalizedType], {
      reference: data?.orderReference || 'N/A',
      buyerName: data?.buyerName || 'Comprador',
      buyerPhone: phone,
      ticketNumbers: [],
      totalAmount: 0,
      rejectionReason: data?.reason,
    });

    await recordNotificationLog({
      orderId,
      channel: 'whatsapp',
      eventType: normalizedType,
      recipient: phone,
      status: 'pending',
      errorMessage: null,
      provider: 'manual',
      providerMessageId: null,
      metadata: {
        manual: true,
        stage: 'opened',
        delivery_type: 'manual_whatsapp',
        opened_at: new Date().toISOString(),
        retry: true,
      },
    });

    return {
      success: true,
      whatsAppLink: notif.whatsAppLink,
    };
  }

  if (channel === 'email') {
    try {
      const emailResult = await sendTransactionalEmail({
        orderId,
        eventType: normalizedType,
        receiptPngBase64: data?.receiptPngBase64,
        receiptFileName: data?.receiptFileName,
        isRetry: true,
      });

      return {
        success: emailResult.success,
        error: emailResult.error,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Error inesperado al reintentar correo transaccional',
      };
    }
  }

  return { success: false, error: 'Canal no soportado' };
}

export type EmailTraceabilityStatus =
  | 'not_required'
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed';

export interface EmailTraceabilitySummary {
  status: EmailTraceabilityStatus;
  label: string;
  badgeVariant: 'neutral' | 'warning' | 'info' | 'success' | 'danger';
  canRetry: boolean;
  isAlreadyProcessed: boolean;
  messageId?: string;
  recipientMasked: string;
  attempts: number;
  lastAttemptAt?: string;
  errorMessage?: string;
  latestLog?: NotificationLogRow;
}

/**
 * Calcula el estado de trazabilidad verídico del canal de correo para una orden.
 * Estados mínimos: 'not_required' | 'pending' | 'sent' | 'delivered' | 'failed'.
 */
export function computeEmailTraceability(
  order: {
    status: string;
    contact_preference?: ContactPreference | string | null;
    buyers?: { email?: string | null } | null;
  },
  logs: NotificationLogRow[]
): EmailTraceabilitySummary {
  const pref = (order.contact_preference || 'both').toLowerCase();
  const buyerEmail = order.buyers?.email?.trim();
  const isRequired = (pref === 'email' || pref === 'both') && Boolean(buyerEmail);

  // Filtrar logs de correo ordenados desc por fecha
  const emailLogs = logs
    .filter((l) => l.channel === 'email')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestLog = emailLogs[0];
  const meta = (typeof latestLog?.metadata === 'object' && latestLog?.metadata !== null
    ? latestLog.metadata
    : {}) as Record<string, any>;
  const messageId =
    latestLog?.provider_message_id ||
    meta?.messageId ||
    meta?.message_id ||
    undefined;
  const attempts = latestLog?.attempts || 0;
  const lastAttemptAt = latestLog?.last_attempt_at || latestLog?.created_at;
  const errorMessage = latestLog?.error_message || undefined;
  const recipientMasked = maskEmail(latestLog?.recipient || buyerEmail) || 'N/A';

  if (!isRequired) {
    return {
      status: 'not_required',
      label: 'No requerido',
      badgeVariant: 'neutral',
      canRetry: false,
      isAlreadyProcessed: false,
      messageId,
      recipientMasked,
      attempts,
      lastAttemptAt,
      errorMessage,
      latestLog,
    };
  }

  // Si existe registro en notification_logs
  if (latestLog) {
    if (latestLog.status === 'delivered') {
      return {
        status: 'delivered',
        label: 'Entregado',
        badgeVariant: 'success',
        canRetry: false,
        isAlreadyProcessed: true,
        messageId,
        recipientMasked,
        attempts,
        lastAttemptAt,
        errorMessage,
        latestLog,
      };
    }

    if (latestLog.status === 'sent') {
      // Brevo aceptó el mensaje para encolamiento/envío SMTP
      return {
        status: 'sent',
        label: 'Enviado (Aceptado por Brevo)',
        badgeVariant: 'success',
        canRetry: false,
        isAlreadyProcessed: true,
        messageId,
        recipientMasked,
        attempts,
        lastAttemptAt,
        errorMessage,
        latestLog,
      };
    }

    if (latestLog.status === 'failed' || latestLog.status === 'bounced') {
      // Falló el envío. Se permite reintento si la orden sigue siendo apta
      const isOrderEligible = order.status === 'paid' || order.status === 'rejected';

      return {
        status: 'failed',
        label: latestLog.status === 'bounced' ? 'Rebotado' : 'Fallido',
        badgeVariant: 'danger',
        canRetry: isOrderEligible,
        isAlreadyProcessed: false,
        messageId,
        recipientMasked,
        attempts,
        lastAttemptAt,
        errorMessage,
        latestLog,
      };
    }

    // Pendiente en logs
    return {
      status: 'pending',
      label: 'Pendiente',
      badgeVariant: 'warning',
      canRetry: false,
      isAlreadyProcessed: false,
      messageId,
      recipientMasked,
      attempts,
      lastAttemptAt,
      errorMessage,
      latestLog,
    };
  }

  // Aún no hay log de correo registrado
  if (order.status === 'paid') {
    return {
      status: 'pending',
      label: 'Pendiente de envío',
      badgeVariant: 'warning',
      canRetry: true,
      isAlreadyProcessed: false,
      recipientMasked,
      attempts: 0,
    };
  }

  if (order.status === 'rejected') {
    return {
      status: 'pending',
      label: 'Pendiente de notificación',
      badgeVariant: 'warning',
      canRetry: true,
      isAlreadyProcessed: false,
      recipientMasked,
      attempts: 0,
    };
  }

  if (order.status === 'pending_verification' || order.status === 'pending') {
    return {
      status: 'pending',
      label: 'Pendiente (espera aprobación)',
      badgeVariant: 'warning',
      canRetry: false,
      isAlreadyProcessed: false,
      recipientMasked,
      attempts: 0,
    };
  }

  return {
    status: 'not_required',
    label: 'No requerido',
    badgeVariant: 'neutral',
    canRetry: false,
    isAlreadyProcessed: false,
    recipientMasked,
    attempts: 0,
  };
}

/**
 * Reintenta el correo transaccional tras verificar de forma autoritativa en BD:
 * 1. Que la orden continúe en estado 'paid' para eventos de aprobación.
 * 2. Que el correo sea requerido según preferencia y exista email de comprador.
 * 3. Idempotencia: que no exista ya un registro 'sent' o 'delivered' (evita duplicados).
 */
export async function verifyAndRetryEmailNotification(
  orderId: string,
  eventType: NotificationEventType | string,
  data?: {
    buyerEmail?: string;
    buyerName?: string;
    orderReference?: string;
    reason?: string;
    receiptPngBase64?: string;
    receiptFileName?: string;
  }
): Promise<{ success: boolean; error?: string; alreadyProcessed?: boolean }> {
  const normalizedType = normalizeEventType(eventType);

  // 1. Consultar estado real actual de la orden en base de datos
  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, contact_preference')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !orderRow) {
    return {
      success: false,
      error: 'No se pudo verificar el estado actual de la orden en la base de datos.',
    };
  }

  // 2. Verificar que continúe pagada si es confirmación de pago
  if (normalizedType === NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED && orderRow.status !== 'paid') {
    return {
      success: false,
      error: `Operación no permitida: La orden debe encontrarse en estado pagada ('paid') para reenviar la confirmación de pago (estado actual: '${orderRow.status}').`,
    };
  }

  // 3. Verificar que el correo sea requerido
  const preference = orderRow.contact_preference || 'both';
  if (preference === 'whatsapp') {
    return {
      success: false,
      error: 'El comprador seleccionó exclusivamente WhatsApp. El correo no es requerido.',
    };
  }

  // 4. Idempotencia: Verificar si ya existe un correo exitoso 'sent' o 'delivered'
  const { data: existingLogs } = await supabase
    .from('notification_logs')
    .select('id, status, metadata, provider, provider_message_id, idempotency_key')
    .eq('order_id', orderId)
    .eq('channel', 'email')
    .eq('event_type', normalizedType);

  const alreadyProcessed = existingLogs?.some(
    (l) => l.status === 'sent' || l.status === 'delivered'
  );

  if (alreadyProcessed) {
    return {
      success: false,
      alreadyProcessed: true,
      error: 'Correo ya procesado: ya existe registro de envío o entrega exitosa para esta orden.',
    };
  }

  // 5. Proceder al reintento
  return retryNotification(orderId, 'email', normalizedType, data);
}
