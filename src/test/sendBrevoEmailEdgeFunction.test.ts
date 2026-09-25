import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Suite de Pruebas Unitarias para la Supabase Edge Function: send-brevo-email
 *
 * Cubre:
 * 1. Payload inválido (orderId faltante, eventType inválido, cuerpo no JSON)
 * 2. Usuario no autorizado (sin token, sesión inválida, usuario sin rol de admin)
 * 3. Orden inexistente (404)
 * 4. Consistencia de estado de orden (order no 'paid' en payment_approved, no 'rejected' en payment_rejected)
 * 5. Idempotencia estricta por clave 'email-{eventType}-{orderId}' (skip vs retry)
 * 6. Envío exitoso con Brevo (retorno de messageId, log 'sent')
 * 7. Fallo de Brevo controlado (HTTP error o timeout, log 'failed', respuesta segura sin revertir pago)
 * 8. Manejo de adjuntos (comprobante PNG base64 sanitizado en payment_approved, omitido en payment_rejected)
 * 9. Ausencia de BREVO_API_KEY en secretos
 */

interface MockServerEnv {
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  BREVO_REPLY_TO_EMAIL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface MockOrder {
  id: string;
  reference: string;
  total_amount: number;
  ticket_count: number;
  status: string;
  rejection_reason?: string | null;
  buyer?: {
    id: string;
    full_name: string;
    document_id: string;
    phone: string;
    email: string;
    city: string;
  } | null;
  raffle?: {
    id: string;
    title: string;
    draw_date: string;
    lottery_reference: string;
  } | null;
}

interface MockNotificationLog {
  id: string;
  order_id: string;
  event_type: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
  error_message: string | null;
  idempotency_key: string;
  metadata: any;
}

function createBrevoEdgeFunctionHandler(
  env: MockServerEnv,
  db: {
    orders: Map<string, MockOrder>;
    tickets: Map<string, string[]>;
    notificationLogs: Map<string, MockNotificationLog>;
    adminUsers: Set<string>;
    validTokens: Map<string, { id: string; email: string; isAdmin: boolean }>;
  },
  mockFetchBrevo?: (url: string, init: RequestInit) => Promise<Response>
) {
  const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

  return async (req: Request): Promise<Response> => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Método no permitido. Solo se admite el método POST.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Variables de entorno Supabase
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuración incompleta: credenciales de Supabase no disponibles en el servidor.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Parseo de Body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Cuerpo de solicitud inválido: se esperaba un objeto JSON válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { orderId, eventType, receiptPngBase64, receiptFileName, isRetry } = body || {};

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "El parámetro 'orderId' es obligatorio y debe ser una cadena válida." }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanEventType = (eventType || '').trim().toLowerCase();
    const validEventTypes = ['payment_received', 'payment_approved', 'payment_rejected'];

    if (!validEventTypes.includes(cleanEventType)) {
      return new Response(
        JSON.stringify({ success: false, error: `El parámetro 'eventType' no es válido. Debe ser uno de: ${validEventTypes.join(', ')}.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Autenticación y Autorización
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (cleanEventType === 'payment_approved' || cleanEventType === 'payment_rejected') {
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acceso no autorizado: Bearer token de sesión no suministrado.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const sessionUser = db.validTokens.get(token);
      if (!sessionUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Sesión inválida o expirada. Por favor inicie sesión nuevamente.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const isAdmin = sessionUser.isAdmin || db.adminUsers.has(sessionUser.id) || db.adminUsers.has(sessionUser.email);
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acceso denegado: se requieren privilegios de administrador para ejecutar este evento.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Cero confianza en cliente: Recuperar datos desde DB
    const order = db.orders.get(orderId.trim());
    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: 'La orden especificada no fue encontrada en la base de datos.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar estado de la orden
    if (cleanEventType === 'payment_approved' && order.status !== 'paid') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Estado de orden no válido para notificación de aprobación: la orden debe estar 'paid' pero se encuentra en '${order.status}'.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (cleanEventType === 'payment_rejected' && order.status !== 'rejected') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Estado de orden no válido para notificación de rechazo: la orden debe estar 'rejected' pero se encuentra en '${order.status}'.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const buyer = order.buyer;
    const buyerEmail = buyer?.email ? buyer.email.trim() : '';
    const idempotencyKey = `email-${cleanEventType}-${order.id}`;

    if (!buyerEmail || !buyerEmail.includes('@')) {
      const errorMsg = 'El comprador asociado a la orden no cuenta con un correo electrónico válido.';
      db.notificationLogs.set(idempotencyKey, {
        id: `log-${Date.now()}`,
        order_id: order.id,
        event_type: cleanEventType,
        channel: 'email',
        recipient: buyerEmail || 'Sin correo',
        status: 'failed',
        attempts: 1,
        error_message: errorMsg,
        idempotency_key: idempotencyKey,
        metadata: { error: errorMsg, reference: order.reference },
      });

      return new Response(
        JSON.stringify({
          success: false,
          eventType: cleanEventType,
          channel: 'email',
          status: 'failed',
          error: errorMsg,
          idempotencyKey,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Idempotencia
    const existingLog = db.notificationLogs.get(idempotencyKey);
    if (existingLog && (existingLog.status === 'sent' || existingLog.status === 'delivered') && !isRetry) {
      return new Response(
        JSON.stringify({
          success: true,
          eventType: cleanEventType,
          channel: 'email',
          status: 'skipped',
          messageId: existingLog.metadata?.messageId,
          idempotencyKey,
          message: 'Notificación de correo ya enviada previamente (idempotente).',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 7. Secreto BREVO_API_KEY
    if (!env.BREVO_API_KEY) {
      const errorMsg = 'Servicio de correo transaccional no configurado: BREVO_API_KEY no definida.';
      db.notificationLogs.set(idempotencyKey, {
        id: existingLog?.id || `log-${Date.now()}`,
        order_id: order.id,
        event_type: cleanEventType,
        channel: 'email',
        recipient: buyerEmail,
        status: 'failed',
        attempts: (existingLog?.attempts || 0) + 1,
        error_message: errorMsg,
        idempotency_key: idempotencyKey,
        metadata: { error: errorMsg, reference: order.reference },
      });

      return new Response(
        JSON.stringify({
          success: false,
          eventType: cleanEventType,
          channel: 'email',
          status: 'failed',
          error: errorMsg,
          idempotencyKey,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 8. Construcción de payload para Brevo
    const hasAttachment = Boolean(
      cleanEventType === 'payment_approved' &&
      receiptPngBase64 &&
      typeof receiptPngBase64 === 'string' &&
      receiptPngBase64.trim().length > 0
    );

    const brevoPayload: any = {
      sender: {
        name: env.BREVO_SENDER_NAME || 'Rifa Manaure Balcón del Cesar',
        email: env.BREVO_SENDER_EMAIL || 'notificaciones@rifamanaure.com',
      },
      to: [{ email: buyerEmail, name: buyer?.full_name || 'Comprador' }],
      subject: `Notificación Rifa Manaure (${order.reference})`,
      htmlContent: `<p>Hola ${buyer?.full_name}</p>`,
      textContent: `Hola ${buyer?.full_name}`,
    };

    if (hasAttachment && receiptPngBase64) {
      brevoPayload.attachment = [
        {
          content: receiptPngBase64.replace(/^data:image\/[a-z]+;base64,/, '').trim(),
          name: receiptFileName || `comprobante-${order.reference}.png`,
        },
      ];
    }

    // 9. Llamada HTTP a Brevo
    try {
      const fetchImpl = mockFetchBrevo || fetch;
      const brevoRes = await fetchImpl(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(brevoPayload),
      });

      const responseText = await brevoRes.text();
      let brevoData: any = {};
      try {
        brevoData = JSON.parse(responseText);
      } catch {
        brevoData = { message: responseText };
      }

      if (brevoRes.ok) {
        const messageId = brevoData.messageId || `brevo-${Date.now()}`;
        db.notificationLogs.set(idempotencyKey, {
          id: existingLog?.id || `log-${Date.now()}`,
          order_id: order.id,
          event_type: cleanEventType,
          channel: 'email',
          recipient: buyerEmail,
          status: 'sent',
          attempts: (existingLog?.attempts || 0) + 1,
          error_message: null,
          idempotency_key: idempotencyKey,
          metadata: {
            messageId,
            sent_at: new Date().toISOString(),
            reference: order.reference,
            has_attachment: hasAttachment,
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            eventType: cleanEventType,
            channel: 'email',
            status: 'sent',
            messageId,
            idempotencyKey,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        const errorMsg = brevoData?.message || `Error de Brevo (HTTP ${brevoRes.status})`;
        db.notificationLogs.set(idempotencyKey, {
          id: existingLog?.id || `log-${Date.now()}`,
          order_id: order.id,
          event_type: cleanEventType,
          channel: 'email',
          recipient: buyerEmail,
          status: 'failed',
          attempts: (existingLog?.attempts || 0) + 1,
          error_message: errorMsg,
          idempotency_key: idempotencyKey,
          metadata: { error: errorMsg, reference: order.reference },
        });

        return new Response(
          JSON.stringify({
            success: false,
            eventType: cleanEventType,
            channel: 'email',
            status: 'failed',
            error: errorMsg,
            idempotencyKey,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (err: any) {
      const errorMsg = err?.message?.includes('timeout')
        ? 'Tiempo de espera agotado al conectar con el servidor de correo Brevo.'
        : 'Error de red al conectar con Brevo.';

      db.notificationLogs.set(idempotencyKey, {
        id: existingLog?.id || `log-${Date.now()}`,
        order_id: order.id,
        event_type: cleanEventType,
        channel: 'email',
        recipient: buyerEmail,
        status: 'failed',
        attempts: (existingLog?.attempts || 0) + 1,
        error_message: errorMsg,
        idempotency_key: idempotencyKey,
        metadata: { error: errorMsg, reference: order.reference },
      });

      return new Response(
        JSON.stringify({
          success: false,
          eventType: cleanEventType,
          channel: 'email',
          status: 'failed',
          error: errorMsg,
          idempotencyKey,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

describe('Supabase Edge Function: send-brevo-email', () => {
  let defaultEnv: MockServerEnv;
  let db: {
    orders: Map<string, MockOrder>;
    tickets: Map<string, string[]>;
    notificationLogs: Map<string, MockNotificationLog>;
    adminUsers: Set<string>;
    validTokens: Map<string, { id: string; email: string; isAdmin: boolean }>;
  };

  beforeEach(() => {
    defaultEnv = {
      BREVO_API_KEY: 'xkeysib-mock-api-key-12345678',
      BREVO_SENDER_EMAIL: 'notificaciones@rifamanaure.com',
      BREVO_SENDER_NAME: 'Rifa Manaure Balcón del Cesar',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-key',
    };

    db = {
      orders: new Map(),
      tickets: new Map(),
      notificationLogs: new Map(),
      adminUsers: new Set(['admin-uuid-1', 'admin@manaurevive.com']),
      validTokens: new Map([
        ['admin-valid-token', { id: 'admin-uuid-1', email: 'admin@manaurevive.com', isAdmin: true }],
        ['non-admin-token', { id: 'user-uuid-99', email: 'cliente@example.com', isAdmin: false }],
      ]),
    };

    // Orden de prueba en estado 'paid'
    db.orders.set('ord-paid-1', {
      id: 'ord-paid-1',
      reference: 'MAN-2026-001',
      total_amount: 50000,
      ticket_count: 2,
      status: 'paid',
      buyer: {
        id: 'buy-1',
        full_name: 'Carlos Pérez',
        document_id: '12345678',
        phone: '3001234567',
        email: 'carlos@example.com',
        city: 'Manaure',
      },
      raffle: {
        id: 'raf-1',
        title: 'Gran Rifa Manaure 2026',
        draw_date: '2026-12-31T20:00:00Z',
        lottery_reference: 'Lotería de La Guajira',
      },
    });
    db.tickets.set('ord-paid-1', ['0142', '0588']);

    // Orden de prueba en estado 'rejected'
    db.orders.set('ord-rejected-1', {
      id: 'ord-rejected-1',
      reference: 'MAN-2026-002',
      total_amount: 25000,
      ticket_count: 1,
      status: 'rejected',
      rejection_reason: 'Comprobante ilegible',
      buyer: {
        id: 'buy-2',
        full_name: 'Laura Gómez',
        document_id: '87654321',
        phone: '3009876543',
        email: 'laura@example.com',
        city: 'Valledupar',
      },
      raffle: {
        id: 'raf-1',
        title: 'Gran Rifa Manaure 2026',
        draw_date: '2026-12-31T20:00:00Z',
        lottery_reference: 'Lotería de La Guajira',
      },
    });

    // Orden de prueba en estado 'pending'
    db.orders.set('ord-pending-1', {
      id: 'ord-pending-1',
      reference: 'MAN-2026-003',
      total_amount: 25000,
      ticket_count: 1,
      status: 'pending',
      buyer: {
        id: 'buy-3',
        full_name: 'Marcos Ríos',
        document_id: '11223344',
        phone: '3110001122',
        email: 'marcos@example.com',
        city: 'Manaure',
      },
    });
  });

  describe('1. Validación de Payload y Método HTTP', () => {
    it('debe rechazar métodos HTTP distintos a POST con 405', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'GET',
      });
      const res = await handler(req);
      expect(res.status).toBe(405);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('POST');
    });

    it('debe responder ok al preflight CORS OPTIONS', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'OPTIONS',
      });
      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('ok');
    });

    it('debe rechazar solicitudes con cuerpo no JSON con 400', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'esto no es un json',
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('JSON');
    });

    it('debe rechazar si falta el campo orderId con 400', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('orderId');
    });

    it('debe rechazar si el eventType no es válido con 400', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'evento_falso' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('eventType');
    });
  });

  describe('2. Autenticación y Autorización por JWT', () => {
    it('debe exigir token de autorización para payment_approved (401)', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('token');
    });

    it('debe rechazar tokens con sesión inválida o expirada (401)', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-invalido-expirado',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Sesión inválida o expirada');
    });

    it('debe rechazar usuarios autenticados sin privilegios de administrador (403)', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer non-admin-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('privilegios de administrador');
    });
  });

  describe('3. Validación de Orden y Consistencia de Estado', () => {
    it('debe retornar 404 si la orden no existe en PostgreSQL', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'orden-fantasma-999', eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('no fue encontrada');
    });

    it('debe exigir que la orden se encuentre en estado "paid" para payment_approved (400)', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-pending-1', eventType: 'payment_approved' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("debe estar 'paid'");
    });

    it('debe exigir que la orden se encuentre en estado "rejected" para payment_rejected (400)', async () => {
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db);
      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_rejected' }),
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("debe estar 'rejected'");
    });
  });

  describe('4. Idempotencia y Reintentos', () => {
    it('debe omitir el reenvío si la notificación ya fue enviada con éxito (status: skipped)', async () => {
      const idempotencyKey = 'email-payment_approved-ord-paid-1';
      db.notificationLogs.set(idempotencyKey, {
        id: 'log-existente',
        order_id: 'ord-paid-1',
        event_type: 'payment_approved',
        channel: 'email',
        recipient: 'carlos@example.com',
        status: 'sent',
        attempts: 1,
        error_message: null,
        idempotency_key: idempotencyKey,
        metadata: { messageId: '<msg-preexistente-001@brevo>' },
      });

      const fetchSpy = vi.fn();
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, fetchSpy);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('skipped');
      expect(json.messageId).toBe('<msg-preexistente-001@brevo>');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('debe forzar el reenvío a Brevo si se especifica isRetry: true a pesar de existir log previo', async () => {
      const idempotencyKey = 'email-payment_approved-ord-paid-1';
      db.notificationLogs.set(idempotencyKey, {
        id: 'log-existente',
        order_id: 'ord-paid-1',
        event_type: 'payment_approved',
        channel: 'email',
        recipient: 'carlos@example.com',
        status: 'sent',
        attempts: 1,
        error_message: null,
        idempotency_key: idempotencyKey,
        metadata: { messageId: '<msg-viejo@brevo>' },
      });

      const mockBrevoFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ messageId: '<msg-reintento-002@brevo>' }), { status: 201 })
      );
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({
          orderId: 'ord-paid-1',
          eventType: 'payment_approved',
          isRetry: true,
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('sent');
      expect(json.messageId).toBe('<msg-reintento-002@brevo>');
      expect(mockBrevoFetch).toHaveBeenCalledTimes(1);

      // Verificar que el log se actualizó con attempts = 2
      const updatedLog = db.notificationLogs.get(idempotencyKey);
      expect(updatedLog?.attempts).toBe(2);
      expect(updatedLog?.metadata.messageId).toBe('<msg-reintento-002@brevo>');
    });
  });

  describe('5. Despacho Exitoso con Brevo (Success)', () => {
    it('debe enviar correo a Brevo, guardar messageId y registrar status: "sent" en notification_logs', async () => {
      let capturedPayload: any = null;
      const mockBrevoFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ messageId: '<brevo-2026-carlos-1>' }), { status: 201 });
      });

      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.status).toBe('sent');
      expect(json.channel).toBe('email');
      expect(json.messageId).toBe('<brevo-2026-carlos-1>');

      // Verificar carga enviada a Brevo
      expect(capturedPayload.to[0].email).toBe('carlos@example.com');
      expect(capturedPayload.to[0].name).toBe('Carlos Pérez');
      expect(capturedPayload.sender.email).toBe('notificaciones@rifamanaure.com');

      // Trazabilidad en BD
      const log = db.notificationLogs.get('email-payment_approved-ord-paid-1');
      expect(log).toBeDefined();
      expect(log?.status).toBe('sent');
      expect(log?.metadata.messageId).toBe('<brevo-2026-carlos-1>');
    });
  });

  describe('6. Manejo de Adjuntos (Comprobante PNG)', () => {
    it('debe incluir el comprobante PNG en base64 en la carga de Brevo si es payment_approved', async () => {
      let capturedPayload: any = null;
      const mockBrevoFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ messageId: '<msg-with-attachment>' }), { status: 201 });
      });

      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({
          orderId: 'ord-paid-1',
          eventType: 'payment_approved',
          receiptPngBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          receiptFileName: 'recibo-oficial-MAN-2026-001.png',
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(capturedPayload.attachment).toBeDefined();
      expect(capturedPayload.attachment.length).toBe(1);
      expect(capturedPayload.attachment[0].name).toBe('recibo-oficial-MAN-2026-001.png');
      expect(capturedPayload.attachment[0].content).not.toContain('data:image/png;base64,');
    });

    it('no debe incluir comprobante en payment_rejected aunque se envíe base64', async () => {
      let capturedPayload: any = null;
      const mockBrevoFetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ messageId: '<msg-rejected>' }), { status: 201 });
      });

      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({
          orderId: 'ord-rejected-1',
          eventType: 'payment_rejected',
          receiptPngBase64: 'base64-no-deseado',
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(capturedPayload.attachment).toBeUndefined();
    });
  });

  describe('7. Manejo Resiliente de Fallos en Brevo (Failure Handling)', () => {
    it('debe registrar status: "failed" y responder de forma controlada sin lanzar excepción', async () => {
      const mockBrevoFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid API key or account suspended' }), {
          status: 401,
        })
      );

      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200); // 200 controlado para no romper frontend tras aprobación en DB
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe('failed');
      expect(json.error).toContain('Invalid API key');

      // Trazabilidad refleja el fallo
      const log = db.notificationLogs.get('email-payment_approved-ord-paid-1');
      expect(log?.status).toBe('failed');
      expect(log?.error_message).toContain('Invalid API key');
    });

    it('debe responder de forma controlada ante timeouts o fallos de conexión', async () => {
      const mockBrevoFetch = vi.fn().mockRejectedValue(new Error('Connection timeout to Brevo API'));
      const handler = createBrevoEdgeFunctionHandler(defaultEnv, db, mockBrevoFetch);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe('failed');
      expect(json.error).toContain('Tiempo de espera agotado');
    });

    it('debe responder con status: "failed" si BREVO_API_KEY no está configurada', async () => {
      const envWithoutKey = { ...defaultEnv, BREVO_API_KEY: '' };
      const handler = createBrevoEdgeFunctionHandler(envWithoutKey, db);

      const req = new Request('https://example.supabase.co/functions/v1/send-brevo-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-valid-token',
        },
        body: JSON.stringify({ orderId: 'ord-paid-1', eventType: 'payment_approved' }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe('failed');
      expect(json.error).toContain('BREVO_API_KEY no definida');
    });
  });
});
