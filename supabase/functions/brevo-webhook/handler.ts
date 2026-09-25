/**
 * Controlador puro y testeable para la recepción y procesamiento de Webhooks
 * transaccionales de Brevo en Supabase Edge Functions.
 *
 * REGLAS INFRANQUEABLES:
 * - NO modificar estados financieros.
 * - NO tocar orders.status (ni ninguna columna de orders).
 * - NO aprobar ni rechazar pagos.
 * - SOLO actualizar la trazabilidad en public.notification_logs.
 * - Validar rigurosamente la autenticidad (firma/secreto).
 * - No retroceder estados (ej. delivered -> sent).
 */

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

export interface BrevoWebhookEvent {
  event: string;
  email?: string;
  id?: number | string;
  date?: string;
  ts?: number;
  ts_event?: number;
  'message-id'?: string;
  messageId?: string;
  message_id?: string;
  subject?: string;
  tags?: string[];
  template_id?: number;
  reason?: string;
  [key: string]: unknown;
}

export interface WebhookProcessingResult {
  success: boolean;
  status: 'processed' | 'skipped' | 'not_found' | 'error' | 'ignored';
  messageId?: string;
  currentStatus?: string;
  newStatus?: string;
  logId?: string;
  orderId?: string;
  error?: string;
  reason?: string;
}

/**
 * Compara dos cadenas en tiempo constante para mitigar ataques de temporización.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Valida la autenticidad de la petición del webhook de Brevo
 * mediante Bearer Token, cabeceras personalizadas o parámetro URL.
 */
export function verifyWebhookAuth(req: Request, expectedSecret: string): boolean {
  if (!expectedSecret || expectedSecret.trim().length === 0) {
    return false;
  }

  const cleanSecret = expectedSecret.trim();

  // 1. Bearer Token en cabecera Authorization
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (timingSafeEqualStr(token, cleanSecret)) {
      return true;
    }
  }

  // 2. Cabeceras personalizadas de secreto
  const customHeader1 = req.headers.get('x-webhook-secret') || '';
  if (customHeader1 && timingSafeEqualStr(customHeader1.trim(), cleanSecret)) {
    return true;
  }

  const customHeader2 = req.headers.get('x-brevo-webhook-secret') || '';
  if (customHeader2 && timingSafeEqualStr(customHeader2.trim(), cleanSecret)) {
    return true;
  }

  // 3. Parámetro de consulta en URL (?secret= o ?token=)
  try {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret') || url.searchParams.get('token') || '';
    if (querySecret && timingSafeEqualStr(querySecret.trim(), cleanSecret)) {
      return true;
    }
  } catch {
    // URL no parseable
  }

  return false;
}

/**
 * Normaliza los eventos emitidos por Brevo al contrato de estados de notification_logs.
 */
export function normalizeBrevoEvent(rawEvent: string): {
  status: NotificationStatus | null;
  isKnown: boolean;
  category: 'delivered' | 'bounced' | 'failed' | 'engagement' | 'unknown';
  defaultReason?: string;
} {
  const clean = (rawEvent || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

  switch (clean) {
    case 'delivered':
      return { status: 'delivered', isKnown: true, category: 'delivered' };

    case 'bounced':
    case 'hardbounce':
    case 'softbounce':
      return {
        status: 'bounced',
        isKnown: true,
        category: 'bounced',
        defaultReason: clean.includes('hard')
          ? 'Rebote duro (hard bounce): dirección inexistente o buzón rechazado.'
          : 'Rebote suave (soft bounce): buzón lleno o servidor temporalmente saturado.',
      };

    case 'blocked':
      return {
        status: 'failed',
        isKnown: true,
        category: 'failed',
        defaultReason: 'Correo bloqueado por políticas de entrega o reputación del remitente.',
      };

    case 'deferred':
      return {
        status: 'failed',
        isKnown: true,
        category: 'failed',
        defaultReason: 'Entrega diferida temporalmente por el servidor de correo de destino.',
      };

    case 'complaint':
    case 'spam':
      return {
        status: 'failed',
        isKnown: true,
        category: 'failed',
        defaultReason: 'El destinatario reportó el correo transaccional como no deseado (spam).',
      };

    case 'invalid':
    case 'invalidemail':
    case 'error':
      return {
        status: 'failed',
        isKnown: true,
        category: 'failed',
        defaultReason: 'Dirección de correo electrónico marcada como inválida por Brevo.',
      };

    case 'opened':
    case 'uniqueopened':
    case 'click':
    case 'clicked':
      return { status: null, isKnown: true, category: 'engagement' };

    case 'request':
    case 'sent':
      return { status: 'sent', isKnown: true, category: 'delivered' };

    default:
      return { status: null, isKnown: false, category: 'unknown' };
  }
}

/**
 * Evalúa si una transición de estado en notification_logs es válida
 * y no representa una regresión destructiva.
 * Regla: No retroceder de estados terminales.
 */
export function canTransitionStatus(
  currentStatus: string,
  newStatus: NotificationStatus
): boolean {
  if (currentStatus === newStatus) return true;

  // delivered es el estado máximo de entrega confirmada: nunca retrocede a sent, pending o failed
  if (currentStatus === 'delivered') {
    return false;
  }

  // bounced no retrocede a sent ni pending
  if (currentStatus === 'bounced') {
    return newStatus === 'delivered';
  }

  // failed puede promoverse a delivered o confirmarse como bounced
  if (currentStatus === 'failed') {
    return newStatus === 'delivered' || newStatus === 'bounced';
  }

  // sent puede avanzar a delivered, bounced o failed
  if (currentStatus === 'sent') {
    return newStatus === 'delivered' || newStatus === 'bounced' || newStatus === 'failed';
  }

  // pending puede avanzar a cualquiera
  if (currentStatus === 'pending') {
    return true;
  }

  return false;
}

/**
 * Procesa un evento individual del webhook de Brevo y actualiza notification_logs.
 */
export async function processBrevoWebhookEvent(
  adminClient: any,
  eventData: BrevoWebhookEvent
): Promise<WebhookProcessingResult> {
  const rawEvent = eventData.event;
  if (!rawEvent || typeof rawEvent !== 'string') {
    return {
      success: false,
      status: 'error',
      error: 'Campo "event" obligatorio no proporcionado o inválido.',
    };
  }

  const rawMessageId = String(
    eventData['message-id'] || eventData.messageId || eventData.message_id || ''
  ).trim();

  if (!rawMessageId) {
    return {
      success: false,
      status: 'error',
      error: 'Identificador de mensaje ("message-id") obligatorio no proporcionado.',
    };
  }

  const cleanMessageId = rawMessageId.replace(/^<|>$/g, '').trim();
  const wrappedMessageId = `<${cleanMessageId}>`;

  const normalized = normalizeBrevoEvent(rawEvent);
  if (!normalized.isKnown) {
    return {
      success: false,
      status: 'error',
      error: `Evento desconocido o no soportado: "${rawEvent}".`,
    };
  }

  // 1. Buscar el registro en notification_logs por provider_message_id
  const { data: logs, error: queryError } = await adminClient
    .from('notification_logs')
    .select('id, order_id, channel, event_type, status, attempts, provider_message_id, idempotency_key, metadata, created_at, updated_at')
    .eq('channel', 'email')
    .or(`provider_message_id.eq.${rawMessageId},provider_message_id.eq.${cleanMessageId},provider_message_id.eq.${wrappedMessageId}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (queryError) {
    console.error('[brevo-webhook] Error al consultar notification_logs:', queryError.message);
    return {
      success: false,
      status: 'error',
      error: 'Error de base de datos al buscar registro de notificación.',
    };
  }

  let logRow = logs?.[0];

  // Fallback si no fue encontrado por provider_message_id: intentar por metadata->>'messageId'
  if (!logRow) {
    const { data: fallbackLogs } = await adminClient
      .from('notification_logs')
      .select('id, order_id, channel, event_type, status, attempts, provider_message_id, idempotency_key, metadata, created_at, updated_at')
      .eq('channel', 'email')
      .or(`metadata->>messageId.eq.${rawMessageId},metadata->>messageId.eq.${cleanMessageId},metadata->>messageId.eq.${wrappedMessageId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    logRow = fallbackLogs?.[0];
  }

  // Si no se encuentra el mensaje en BD:
  if (!logRow) {
    console.warn(`[brevo-webhook] messageId no encontrado en notification_logs: ${rawMessageId}`);
    return {
      success: true,
      status: 'not_found',
      messageId: rawMessageId,
      reason: 'El messageId no corresponde a ninguna orden registrada en el sistema.',
    };
  }

  // Si es un evento de engagement (opened/click), registrar en metadata sin alterar el status
  if (normalized.category === 'engagement') {
    const existingMeta = (logRow.metadata || {}) as Record<string, any>;
    const updatePayload: Record<string, any> = {
      metadata: {
        ...existingMeta,
        last_engagement_event: rawEvent,
        last_engagement_at: eventData.date || new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    await adminClient
      .from('notification_logs')
      .update(updatePayload)
      .eq('id', logRow.id);

    return {
      success: true,
      status: 'processed',
      messageId: rawMessageId,
      currentStatus: logRow.status,
      newStatus: logRow.status,
      logId: logRow.id,
      orderId: logRow.order_id,
    };
  }

  const targetStatus = normalized.status;
  if (!targetStatus) {
    return {
      success: true,
      status: 'ignored',
      messageId: rawMessageId,
      currentStatus: logRow.status,
      reason: `El evento "${rawEvent}" no produce cambio de estado.`,
    };
  }

  // 2. Validar transición de estado (No retroceder!)
  const canTransition = canTransitionStatus(logRow.status, targetStatus);
  if (!canTransition) {
    console.info(
      `[brevo-webhook] Intento de retroceso ignorado para log ${logRow.id}: ${logRow.status} -> ${targetStatus}`
    );
    return {
      success: true,
      status: 'ignored',
      messageId: rawMessageId,
      currentStatus: logRow.status,
      newStatus: targetStatus,
      logId: logRow.id,
      orderId: logRow.order_id,
      reason: `Transición no permitida: no se permite retroceder de "${logRow.status}" a "${targetStatus}".`,
    };
  }

  // 3. Preparar actualización segura en notification_logs
  // REGLA CRÍTICA: ¡NUNCA TOCAR orders, buyers, tickets ni datos financieros!
  const nowIso = new Date().toISOString();
  const eventDate = eventData.date || nowIso;
  const existingMeta = (logRow.metadata || {}) as Record<string, any>;

  const updateFields: Record<string, any> = {
    status: targetStatus,
    updated_at: nowIso,
    provider_message_id: logRow.provider_message_id || rawMessageId,
    metadata: {
      ...existingMeta,
      last_webhook_event: rawEvent,
      last_webhook_at: nowIso,
      webhook_event_date: eventDate,
    },
  };

  if (targetStatus === 'delivered') {
    updateFields.delivered_at = eventDate;
    updateFields.error_message = null;
  } else if (targetStatus === 'bounced') {
    updateFields.failed_at = eventDate;
    updateFields.error_message =
      eventData.reason || normalized.defaultReason || 'Rebote reportado por Brevo';
  } else if (targetStatus === 'failed') {
    updateFields.failed_at = eventDate;
    updateFields.error_message =
      eventData.reason || normalized.defaultReason || 'Fallo de entrega reportado por Brevo';
  }

  const { error: updateError } = await adminClient
    .from('notification_logs')
    .update(updateFields)
    .eq('id', logRow.id);

  if (updateError) {
    console.error('[brevo-webhook] Error al actualizar notification_logs:', updateError.message);
    return {
      success: false,
      status: 'error',
      error: 'Error de base de datos al actualizar el estado de entrega.',
    };
  }

  console.info(
    `[brevo-webhook] Log ${logRow.id} actualizado: ${logRow.status} -> ${targetStatus} (orden: ${logRow.order_id})`
  );

  return {
    success: true,
    status: 'processed',
    messageId: rawMessageId,
    currentStatus: logRow.status,
    newStatus: targetStatus,
    logId: logRow.id,
    orderId: logRow.order_id,
  };
}

/**
 * Manejador principal de peticiones HTTP para el webhook de Brevo.
 */
export async function handleBrevoWebhook(
  req: Request,
  adminClient: any,
  webhookSecret: string
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-brevo-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método no permitido. Solo se admite POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 1. Validar autenticidad de la petición (Firma / Secreto)
  const isAuthValid = verifyWebhookAuth(req, webhookSecret);
  if (!isAuthValid) {
    console.warn('[brevo-webhook] Intento de acceso no autorizado o firma/secreto inválido.');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Acceso no autorizado: credencial o secreto de webhook inválido.',
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Parsear cuerpo de la petición como JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Cuerpo de solicitud inválido: se esperaba JSON.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({ success: false, error: 'Cuerpo de solicitud vacío o inválido.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Soportar tanto evento individual como array de eventos (batching de Brevo)
  const events: BrevoWebhookEvent[] = Array.isArray(body)
    ? (body as BrevoWebhookEvent[])
    : [body as BrevoWebhookEvent];

  const results: WebhookProcessingResult[] = [];
  for (const ev of events) {
    const res = await processBrevoWebhookEvent(adminClient, ev);
    results.push(res);
  }

  const hasFatalErrors = results.some((r) => !r.success && r.status === 'error');
  const responseStatus = hasFatalErrors ? 400 : 200;

  return new Response(
    JSON.stringify({
      success: !hasFatalErrors,
      processedCount: results.length,
      results,
    }),
    { status: responseStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
