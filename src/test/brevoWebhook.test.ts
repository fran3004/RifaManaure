import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  timingSafeEqualStr,
  verifyWebhookAuth,
  normalizeBrevoEvent,
  canTransitionStatus,
  processBrevoWebhookEvent,
  handleBrevoWebhook,
} from '../../supabase/functions/brevo-webhook/handler';

describe('Brevo Transactional Webhook (supabase/functions/brevo-webhook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Comparación segura en tiempo constante (timingSafeEqualStr)', () => {
    it('debe validar cadenas idénticas correctamente', () => {
      expect(timingSafeEqualStr('super-secret-token-123', 'super-secret-token-123')).toBe(true);
    });

    it('debe rechazar cadenas diferentes de igual o distinta longitud', () => {
      expect(timingSafeEqualStr('super-secret-token-123', 'super-secret-token-456')).toBe(false);
      expect(timingSafeEqualStr('short', 'longer-string')).toBe(false);
      expect(timingSafeEqualStr('', 'secret')).toBe(false);
      expect(timingSafeEqualStr('secret', '')).toBe(false);
    });
  });

  describe('2. Verificación de Autenticidad (verifyWebhookAuth)', () => {
    const validSecret = 'brevo_wh_sec_xyz789';

    it('debe autenticar mediante Bearer token en cabecera Authorization', () => {
      const req = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });
      expect(verifyWebhookAuth(req, validSecret)).toBe(true);
    });

    it('debe autenticar mediante cabecera X-Webhook-Secret', () => {
      const req = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: {
          'X-Webhook-Secret': validSecret,
        },
      });
      expect(verifyWebhookAuth(req, validSecret)).toBe(true);
    });

    it('debe autenticar mediante cabecera X-Brevo-Webhook-Secret', () => {
      const req = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: {
          'X-Brevo-Webhook-Secret': validSecret,
        },
      });
      expect(verifyWebhookAuth(req, validSecret)).toBe(true);
    });

    it('debe autenticar mediante query param ?secret= o ?token=', () => {
      const reqWithSecret = new Request(`https://api.example.com/webhook?secret=${validSecret}`, {
        method: 'POST',
      });
      expect(verifyWebhookAuth(reqWithSecret, validSecret)).toBe(true);

      const reqWithToken = new Request(`https://api.example.com/webhook?token=${validSecret}`, {
        method: 'POST',
      });
      expect(verifyWebhookAuth(reqWithToken, validSecret)).toBe(true);
    });

    it('debe rechazar peticiones con secreto erróneo o ausente', () => {
      const wrongReq = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      });
      expect(verifyWebhookAuth(wrongReq, validSecret)).toBe(false);

      const emptyReq = new Request('https://api.example.com/webhook', { method: 'POST' });
      expect(verifyWebhookAuth(emptyReq, validSecret)).toBe(false);

      // Si no hay secreto configurado en el servidor, debe rechazar por seguridad
      expect(verifyWebhookAuth(wrongReq, '')).toBe(false);
    });
  });

  describe('3. Normalización de Eventos de Brevo (normalizeBrevoEvent)', () => {
    it('debe normalizar eventos "delivered" a status delivered', () => {
      const res = normalizeBrevoEvent('delivered');
      expect(res.status).toBe('delivered');
      expect(res.isKnown).toBe(true);
      expect(res.category).toBe('delivered');
    });

    it('debe normalizar rebotes (bounced, hard_bounce, soft_bounce) a status bounced', () => {
      const hard = normalizeBrevoEvent('hard_bounce');
      expect(hard.status).toBe('bounced');
      expect(hard.category).toBe('bounced');

      const soft = normalizeBrevoEvent('softbounce');
      expect(soft.status).toBe('bounced');
      expect(soft.category).toBe('bounced');
    });

    it('debe normalizar bloqueos, quejas y diferidos a status failed', () => {
      expect(normalizeBrevoEvent('blocked').status).toBe('failed');
      expect(normalizeBrevoEvent('deferred').status).toBe('failed');
      expect(normalizeBrevoEvent('complaint').status).toBe('failed');
      expect(normalizeBrevoEvent('spam').status).toBe('failed');
      expect(normalizeBrevoEvent('invalid').status).toBe('failed');
    });

    it('debe reconocer aperturas y clics como engagement sin alterar el status de entrega', () => {
      const opened = normalizeBrevoEvent('opened');
      expect(opened.status).toBeNull();
      expect(opened.category).toBe('engagement');
      expect(opened.isKnown).toBe(true);

      const click = normalizeBrevoEvent('click');
      expect(click.status).toBeNull();
      expect(click.category).toBe('engagement');
      expect(click.isKnown).toBe(true);
    });

    it('debe marcar eventos desconocidos como no soportados', () => {
      const unknown = normalizeBrevoEvent('unknown_random_event');
      expect(unknown.status).toBeNull();
      expect(unknown.isKnown).toBe(false);
      expect(unknown.category).toBe('unknown');
    });
  });

  describe('4. Prevención de Regresión de Estados (canTransitionStatus)', () => {
    it('permite transiciones válidas desde pending', () => {
      expect(canTransitionStatus('pending', 'sent')).toBe(true);
      expect(canTransitionStatus('pending', 'delivered')).toBe(true);
      expect(canTransitionStatus('pending', 'bounced')).toBe(true);
      expect(canTransitionStatus('pending', 'failed')).toBe(true);
    });

    it('permite transiciones válidas desde sent', () => {
      expect(canTransitionStatus('sent', 'delivered')).toBe(true);
      expect(canTransitionStatus('sent', 'bounced')).toBe(true);
      expect(canTransitionStatus('sent', 'failed')).toBe(true);
      expect(canTransitionStatus('sent', 'sent')).toBe(true);
    });

    it('permite promover failed a delivered o bounced', () => {
      expect(canTransitionStatus('failed', 'delivered')).toBe(true);
      expect(canTransitionStatus('failed', 'bounced')).toBe(true);
    });

    it('PROHÍBE categóricamente retrocesos desde delivered (estado terminal)', () => {
      expect(canTransitionStatus('delivered', 'sent')).toBe(false);
      expect(canTransitionStatus('delivered', 'failed')).toBe(false);
      expect(canTransitionStatus('delivered', 'pending')).toBe(false);
      expect(canTransitionStatus('delivered', 'bounced')).toBe(false);
    });

    it('PROHÍBE retrocesos de bounced a sent o pending', () => {
      expect(canTransitionStatus('bounced', 'sent')).toBe(false);
      expect(canTransitionStatus('bounced', 'pending')).toBe(false);
    });
  });

  describe('5. Procesamiento de Eventos y Manejo de Base de Datos (processBrevoWebhookEvent)', () => {
    const createMockAdminClient = (logRecord: any = null, updateError: any = null) => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      });

      const limitFn = vi.fn().mockResolvedValue({
        data: logRecord ? [logRecord] : [],
        error: null,
      });

      const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
      const orFn = vi.fn().mockReturnValue({ order: orderFn });
      const eqChannelFn = vi.fn().mockReturnValue({ or: orFn });

      const fromFn = vi.fn().mockImplementation((table: string) => {
        // REGLA DE ORO: La tabla 'orders' NUNCA debe ser consultada ni alterada por el webhook
        if (table === 'orders') {
          throw new Error('Violación crítica de integridad: El webhook jamás debe acceder a la tabla orders.');
        }

        if (table === 'notification_logs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: eqChannelFn,
            }),
            update: updateFn,
          };
        }

        throw new Error(`Tabla no esperada: ${table}`);
      });

      return {
        from: fromFn,
        _updateFn: updateFn,
        _eqChannelFn: eqChannelFn,
      };
    };

    it('debe rechazar eventos sin campo "event"', async () => {
      const client = createMockAdminClient();
      const res = await processBrevoWebhookEvent(client, {
        'message-id': 'test-123',
      } as any);

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');
      expect(res.error).toContain('Campo "event" obligatorio');
    });

    it('debe rechazar eventos sin identificador de mensaje', async () => {
      const client = createMockAdminClient();
      const res = await processBrevoWebhookEvent(client, {
        event: 'delivered',
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe('error');
      expect(res.error).toContain('Identificador de mensaje');
    });

    it('debe responder safe 200 con status "not_found" cuando el messageId no existe en BD', async () => {
      const client = createMockAdminClient(null); // Sin registro encontrado
      const res = await processBrevoWebhookEvent(client, {
        event: 'delivered',
        'message-id': 'non-existent-msg-id-999',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('not_found');
      expect(res.reason).toContain('no corresponde a ninguna orden');
    });

    it('debe actualizar sent -> delivered para un messageId conocido', async () => {
      const existingLog = {
        id: 'log-uuid-1',
        order_id: 'order-uuid-abc',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'sent',
        attempts: 1,
        provider_message_id: 'msg-brevo-001',
        metadata: { messageId: 'msg-brevo-001' },
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'delivered',
        'message-id': 'msg-brevo-001',
        date: '2026-09-25T01:00:00Z',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('processed');
      expect(res.currentStatus).toBe('sent');
      expect(res.newStatus).toBe('delivered');
      expect(res.logId).toBe('log-uuid-1');
      expect(res.orderId).toBe('order-uuid-abc');

      // Verificar payload de actualización en notification_logs
      expect(client._updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'delivered',
          delivered_at: '2026-09-25T01:00:00Z',
          error_message: null,
          provider_message_id: 'msg-brevo-001',
        })
      );
    });

    it('debe actualizar sent -> bounced registrando el motivo del rebote', async () => {
      const existingLog = {
        id: 'log-uuid-2',
        order_id: 'order-uuid-def',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'sent',
        attempts: 1,
        provider_message_id: 'msg-brevo-002',
        metadata: {},
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'hard_bounce',
        'message-id': 'msg-brevo-002',
        reason: '550 5.1.1 User unknown',
        date: '2026-09-25T01:05:00Z',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('processed');
      expect(res.newStatus).toBe('bounced');

      expect(client._updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'bounced',
          failed_at: '2026-09-25T01:05:00Z',
          error_message: '550 5.1.1 User unknown',
        })
      );
    });

    it('debe actualizar sent -> failed al recibir evento blocked', async () => {
      const existingLog = {
        id: 'log-uuid-3',
        order_id: 'order-uuid-ghi',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'sent',
        attempts: 1,
        provider_message_id: 'msg-brevo-003',
        metadata: {},
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'blocked',
        'message-id': 'msg-brevo-003',
        reason: 'Mailbox full or policy block',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('processed');
      expect(res.newStatus).toBe('failed');

      expect(client._updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Mailbox full or policy block',
        })
      );
    });

    it('debe IGNORAR intentos de regresión de delivered a sent o failed sin sobreescribir', async () => {
      const existingLog = {
        id: 'log-uuid-4',
        order_id: 'order-uuid-jkl',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'delivered',
        attempts: 1,
        provider_message_id: 'msg-brevo-004',
        metadata: {},
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'sent',
        'message-id': 'msg-brevo-004',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('ignored');
      expect(res.reason).toContain('no se permite retroceder');
      // No debe ejecutarse update destructivo
      expect(client._updateFn).not.toHaveBeenCalled();
    });

    it('debe soportar identificadores de mensaje envueltos en corchetes angulares <...>', async () => {
      const existingLog = {
        id: 'log-uuid-5',
        order_id: 'order-uuid-mno',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'sent',
        attempts: 1,
        provider_message_id: 'raw-id-555',
        metadata: {},
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'delivered',
        'message-id': '<raw-id-555>',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('processed');
      expect(res.newStatus).toBe('delivered');
    });

    it('debe registrar eventos de engagement (apertura) en metadata sin alterar el status de entrega', async () => {
      const existingLog = {
        id: 'log-uuid-6',
        order_id: 'order-uuid-pqr',
        channel: 'email',
        event_type: 'payment_approved',
        status: 'delivered',
        attempts: 1,
        provider_message_id: 'msg-brevo-006',
        metadata: { initial: true },
      };

      const client = createMockAdminClient(existingLog);
      const res = await processBrevoWebhookEvent(client, {
        event: 'opened',
        'message-id': 'msg-brevo-006',
        date: '2026-09-25T01:30:00Z',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('processed');
      expect(res.newStatus).toBe('delivered'); // status no cambia

      expect(client._updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            initial: true,
            last_engagement_event: 'opened',
            last_engagement_at: '2026-09-25T01:30:00Z',
          }),
        })
      );
    });
  });

  describe('6. Integración HTTP y Router (handleBrevoWebhook)', () => {
    const webhookSecret = 'valid-webhook-secret-999';

    const createDummyClient = () => ({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          throw new Error('Violación: La tabla orders no debe ser accedida.');
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'dummy-log-id',
                        order_id: 'dummy-order-id',
                        status: 'sent',
                        channel: 'email',
                        provider_message_id: 'dummy-msg-id',
                        metadata: {},
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }),
    });

    it('debe responder 200 en peticiones preflight OPTIONS', async () => {
      const req = new Request('https://api.example.com/webhook', { method: 'OPTIONS' });
      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('debe rechazar métodos HTTP distintos de POST con 405 Method Not Allowed', async () => {
      const req = new Request(`https://api.example.com/webhook?secret=${webhookSecret}`, {
        method: 'GET',
      });
      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(405);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Solo se admite POST');
    });

    it('debe responder 401 si la autenticación es inválida o ausente', async () => {
      const req = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'delivered', 'message-id': 'abc' }),
      });
      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Acceso no autorizado');
    });

    it('debe procesar exitosamente un evento individual válido con autenticación Bearer', async () => {
      const req = new Request('https://api.example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          event: 'delivered',
          'message-id': 'dummy-msg-id',
          date: '2026-09-25T01:45:00Z',
        }),
      });

      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedCount).toBe(1);
      expect(json.results[0].status).toBe('processed');
      expect(json.results[0].newStatus).toBe('delivered');
    });

    it('debe soportar batching de Brevo (array de múltiples eventos)', async () => {
      const req = new Request(`https://api.example.com/webhook?secret=${webhookSecret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { event: 'delivered', 'message-id': 'dummy-msg-1' },
          { event: 'hard_bounce', 'message-id': 'dummy-msg-2' },
        ]),
      });

      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.processedCount).toBe(2);
    });

    it('debe retornar 400 si el JSON es inválido o corrupto', async () => {
      const req = new Request(`https://api.example.com/webhook?secret=${webhookSecret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{{{',
      });

      const client = createDummyClient();
      const res = await handleBrevoWebhook(req, client, webhookSecret);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('se esperaba JSON');
    });
  });
});
