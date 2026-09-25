import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeEventType,
  buildReceiptReceivedMessage,
  buildPaymentApprovedMessage,
  buildPaymentRejectedMessage,
  generateOrderNotification,
  recordNotificationLog,
  getOrderNotificationLogs,
  dispatchOrderNotifications,
  retryNotification,
  recordWhatsAppOpened,
  recordWhatsAppSentManually,
  getNotificationStatusBadge,
  computeEmailTraceability,
  verifyAndRetryEmailNotification,
  maskEmail,
  NOTIFICATION_EVENT_TYPES,
  type OrderNotificationData,
} from '@/services/notificationService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Servicio de Notificaciones por WhatsApp (src/services/notificationService.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNotificationData: OrderNotificationData = {
    reference: 'MAN-2026-001',
    buyerName: 'Carlos Pérez',
    buyerPhone: '3001234567',
    buyerEmail: 'carlos@example.com',
    ticketNumbers: [7, 42, 999],
    totalAmount: 75000,
    raffleTitle: 'Gran Sorteo Manaure',
    drawDate: '31 de Diciembre de 2026',
    verifyUrl: 'https://manaurevive.com/verificar',
    supportPhone: '+57 300 999 8888',
  };

  describe('1. Normalización de Eventos (normalizeEventType)', () => {
    it('debe normalizar eventos de aprobación a payment_approved', () => {
      expect(normalizeEventType('PAYMENT_APPROVED')).toBe('payment_approved');
      expect(normalizeEventType('payment_approved')).toBe('payment_approved');
      expect(normalizeEventType('order_approved')).toBe('payment_approved');
    });

    it('debe normalizar eventos de rechazo a payment_rejected', () => {
      expect(normalizeEventType('PAYMENT_REJECTED')).toBe('payment_rejected');
      expect(normalizeEventType('payment_rejected')).toBe('payment_rejected');
      expect(normalizeEventType('rejected_transfer')).toBe('payment_rejected');
    });

    it('debe normalizar eventos de recibo/pendiente a payment_received por defecto', () => {
      expect(normalizeEventType('PAYMENT_RECEIVED')).toBe('payment_received');
      expect(normalizeEventType('receipt_received')).toBe('payment_received');
      expect(normalizeEventType('unknown_event')).toBe('payment_received');
    });

    it('debe exponer las constantes canónicas centralizadas en NOTIFICATION_EVENT_TYPES', () => {
      expect(NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED).toBe('payment_received');
      expect(NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED).toBe('payment_approved');
      expect(NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED).toBe('payment_rejected');
    });
  });

  describe('2. Generación de Mensajes y Plantillas de WhatsApp', () => {
    describe('buildReceiptReceivedMessage', () => {
      it('debe incluir datos clave del comprobante en revisión', () => {
        const msg = buildReceiptReceivedMessage(mockNotificationData);
        expect(msg).toContain('Carlos Pérez');
        expect(msg).toContain('MAN-2026-001');
        expect(msg).toContain('007');
        expect(msg).toContain('042');
        expect(msg).toContain('999');
        expect(msg).toContain('75.000');
        expect(msg).toContain('Pendiente de verificación manual');
        expect(msg).toContain('https://manaurevive.com/verificar');
      });
    });

    describe('buildPaymentApprovedMessage', () => {
      it('debe incluir detalles de boletos confirmados y fecha de sorteo', () => {
        const msg = buildPaymentApprovedMessage(mockNotificationData);
        expect(msg).toContain('Carlos Pérez');
        expect(msg).toContain('TU PAGO HA SIDO APROBADO');
        expect(msg).toContain('MAN-2026-001');
        expect(msg).toContain('31 de Diciembre de 2026');
        expect(msg).toContain('+57 300 999 8888');
      });
    });

    describe('buildPaymentRejectedMessage', () => {
      it('debe incluir el motivo de rechazo personalizado y advertir liberación', () => {
        const dataWithReason: OrderNotificationData = {
          ...mockNotificationData,
          rejectionReason: 'Comprobante no coincide con la cuenta destino',
        };
        const msg = buildPaymentRejectedMessage(dataWithReason);
        expect(msg).toContain('Carlos Pérez');
        expect(msg).toContain('No fue posible aprobar tu comprobante');
        expect(msg).toContain('Comprobante no coincide con la cuenta destino');
        expect(msg).toContain('han sido liberados');
      });

      it('debe usar motivo por defecto si no se suministra ninguno', () => {
        const dataWithoutReason: OrderNotificationData = {
          ...mockNotificationData,
          rejectionReason: undefined,
        };
        const msg = buildPaymentRejectedMessage(dataWithoutReason);
        expect(msg).toContain('Comprobante no legible o no coincide con los valores en cuenta');
      });
    });
  });

  describe('3. Generador de Notificación (generateOrderNotification)', () => {
    it('debe construir el enlace wa.me correspondiente al número de teléfono y mensaje', () => {
      const notif = generateOrderNotification('receipt_received', mockNotificationData);
      expect(notif.type).toBe('receipt_received');
      expect(notif.title).toContain('Comprobante en Verificación');
      expect(notif.targetPhone).toBe('3001234567');
      expect(notif.whatsAppLink).toContain('https://wa.me/573001234567');
      expect(notif.whatsAppLink).toContain(encodeURIComponent('MAN-2026-001'));
    });

    it('debe generar enlace para pago aprobado', () => {
      const notif = generateOrderNotification('payment_approved', mockNotificationData);
      expect(notif.type).toBe('payment_approved');
      expect(notif.title).toContain('Confirmación de Pago Aprobado');
      expect(notif.whatsAppLink).toContain('https://wa.me/573001234567');
    });

    it('debe generar enlace para pago rechazado', () => {
      const notif = generateOrderNotification('payment_rejected', mockNotificationData);
      expect(notif.type).toBe('payment_rejected');
      expect(notif.title).toContain('Notificación de Pago Rechazado');
      expect(notif.whatsAppLink).toContain('https://wa.me/573001234567');
    });
  });

  describe('4. Registro de Trazabilidad (recordNotificationLog)', () => {
    it('debe realizar upsert con clave de idempotencia calculada', async () => {
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: {
          id: 'log_001',
          order_id: 'ord_test_01',
          channel: 'whatsapp',
          event_type: 'payment_received',
          recipient: '3001234567',
          status: 'sent',
          attempts: 1,
        },
        error: null,
      });

      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await recordNotificationLog({
        orderId: 'ord_test_01',
        channel: 'whatsapp',
        eventType: 'payment_received',
        recipient: '3001234567',
        status: 'sent',
      });

      expect(supabase.from).toHaveBeenCalledWith('notification_logs');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ord_test_01',
          channel: 'whatsapp',
          event_type: 'payment_received',
          recipient: '3001234567',
          status: 'sent',
          attempts: 1,
          idempotency_key: 'whatsapp-payment_received/ord_test_01',
        }),
        { onConflict: 'idempotency_key' }
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe('sent');
    });

    it('debe manejar errores de base de datos retornando null sin lanzar excepción', async () => {
      vi.mocked(supabase.from).mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const result = await recordNotificationLog({
        orderId: 'ord_test_err',
        channel: 'whatsapp',
        eventType: 'payment_received',
        recipient: '3001234567',
        status: 'failed',
      });

      expect(result).toBeNull();
    });
  });

  describe('5. Consulta de Historial (getOrderNotificationLogs)', () => {
    it('debe retornar la lista de logs ordenada por created_at descendente', async () => {
      const mockLogs = [
        {
          id: 'log_1',
          order_id: 'ord_001',
          channel: 'whatsapp',
          event_type: 'payment_approved',
          recipient: '3001234567',
          status: 'sent',
          created_at: '2026-09-18T10:00:00Z',
        },
      ];

      const mockOrder = vi.fn().mockResolvedValueOnce({ data: mockLogs, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      vi.mocked(supabase.from).mockReturnValueOnce({ select: mockSelect } as any);

      const logs = await getOrderNotificationLogs('ord_001');

      expect(supabase.from).toHaveBeenCalledWith('notification_logs');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('order_id', 'ord_001');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(logs).toEqual(mockLogs);
    });

    it('debe retornar array vacío si ocurre un error en la consulta', async () => {
      vi.mocked(supabase.from).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const logs = await getOrderNotificationLogs('ord_err');
      expect(logs).toEqual([]);
    });
  });

  describe('6. Despacho Orquestado (dispatchOrderNotifications)', () => {
    it('debe generar notificación de WhatsApp y registrar trazabilidad con éxito', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_disp', status: 'sent' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await dispatchOrderNotifications({
        orderId: 'ord_dispatch_01',
        contactPreference: 'whatsapp',
        eventType: 'PAYMENT_RECEIVED',
        notificationData: mockNotificationData,
      });

      expect(result.whatsappDispatched).toBe(true);
      expect(result.whatsappNotification).toBeDefined();
      expect(result.whatsappNotification?.whatsAppLink).toContain('wa.me/573001234567');
      expect(result.contactPreference).toBe('whatsapp');
    });

    it('debe registrar status failed si el comprador no tiene celular válido', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_failed', status: 'failed' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await dispatchOrderNotifications({
        orderId: 'ord_dispatch_no_phone',
        contactPreference: 'whatsapp',
        eventType: 'PAYMENT_RECEIVED',
        notificationData: {
          ...mockNotificationData,
          buyerPhone: '',
        },
      });

      expect(result.whatsappDispatched).toBe(false);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          recipient: 'Sin teléfono',
          error_message: expect.stringContaining('no tiene un número de celular válido'),
        }),
        expect.any(Object)
      );
    });

    it('debe despachar WhatsApp y configurar contactPreference en "both" cuando se elige ambos', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_both', status: 'sent' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await dispatchOrderNotifications({
        orderId: 'ord_dispatch_both',
        contactPreference: 'both',
        eventType: 'payment_approved',
        notificationData: mockNotificationData,
      });

      expect(result.contactPreference).toBe('both');
      expect(result.whatsappDispatched).toBe(true);
      expect(result.whatsappNotification).toBeDefined();
    });

    it('no debe despachar WhatsApp si la preferencia de contacto es exclusivamente "email"', async () => {
      const result = await dispatchOrderNotifications({
        orderId: 'ord_dispatch_email_only',
        contactPreference: 'email',
        eventType: 'payment_approved',
        notificationData: mockNotificationData,
      });

      expect(result.contactPreference).toBe('email');
      expect(result.whatsappDispatched).toBe(false);
      expect(result.whatsappNotification).toBeUndefined();
    });
  });

  describe('7. Reintentos (retryNotification)', () => {
    it('debe retornar enlace de WhatsApp y registrar reintento cuando hay teléfono', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_retry', status: 'sent' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await retryNotification('ord_retry_01', 'whatsapp', 'payment_approved', {
        buyerPhone: '3001234567',
        buyerName: 'Carlos Pérez',
        orderReference: 'MAN-2026-001',
      });

      expect(result.success).toBe(true);
      expect(result.whatsAppLink).toContain('https://wa.me/573001234567');
    });

    it('debe responder adecuadamente al solicitar reintento por canal "email"', async () => {
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: { success: true, messageId: 'brevo_retry_001' },
        error: null,
      });

      const result = await retryNotification('ord_retry_email', 'email', 'payment_approved', {
        buyerEmail: 'carlos@example.com',
        buyerName: 'Carlos Pérez',
        orderReference: 'MAN-2026-001',
      });

      expect(result.success).toBe(true);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
        body: expect.objectContaining({
          orderId: 'ord_retry_email',
          eventType: 'payment_approved',
          isRetry: true,
        }),
      });
    });

    it('debe fallar y registrar error si no hay teléfono al reintentar WhatsApp', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_retry_err', status: 'failed' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      const result = await retryNotification('ord_retry_02', 'whatsapp', 'payment_approved', {
        buyerPhone: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró el número de WhatsApp');
    });
  });

  describe('8. Operaciones del Canal Manual WhatsApp y Trazabilidad Verídica', () => {
    it('recordWhatsAppOpened debe registrar etapa "opened" con status pending en DB', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_opened', status: 'pending' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      await recordWhatsAppOpened('ord_manual_01', 'payment_approved', '3001234567');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ord_manual_01',
          channel: 'whatsapp',
          event_type: 'payment_approved',
          recipient: '3001234567',
          status: 'pending',
          metadata: expect.objectContaining({
            manual: true,
            stage: 'opened',
            delivery_type: 'manual_whatsapp',
          }),
        }),
        expect.any(Object)
      );
    });

    it('recordWhatsAppSentManually debe registrar etapa "sent_manually" con status pending en DB', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
      const mockSelectInitial = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
      });
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: { id: 'log_sent_manually', status: 'pending' },
        error: null,
      });
      const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelectInitial,
        upsert: mockUpsert,
      } as any);

      await recordWhatsAppSentManually('ord_manual_02', 'payment_approved', '3001234567');

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 'ord_manual_02',
          channel: 'whatsapp',
          event_type: 'payment_approved',
          recipient: '3001234567',
          status: 'pending',
          metadata: expect.objectContaining({
            manual: true,
            stage: 'sent_manually',
            delivery_type: 'manual_whatsapp',
          }),
        }),
        expect.any(Object)
      );
    });

    it('getNotificationStatusBadge debe clasificar con total exactitud los estados sin mentir', () => {
      // WhatsApp: preparado
      const badgePrepared = getNotificationStatusBadge({
        channel: 'whatsapp',
        status: 'pending',
        metadata: { manual: true, stage: 'prepared' },
      });
      expect(badgePrepared.label).toBe('Plantilla preparada');
      expect(badgePrepared.variant).toBe('warning');

      // WhatsApp: enlace abierto
      const badgeOpened = getNotificationStatusBadge({
        channel: 'whatsapp',
        status: 'pending',
        metadata: { manual: true, stage: 'opened' },
      });
      expect(badgeOpened.label).toBe('WhatsApp abierto');
      expect(badgeOpened.variant).toBe('info');

      // WhatsApp: enviado manualmente
      const badgeSentManually = getNotificationStatusBadge({
        channel: 'whatsapp',
        status: 'pending',
        metadata: { manual: true, stage: 'sent_manually' },
      });
      expect(badgeSentManually.label).toBe('Enviado manualmente');
      expect(badgeSentManually.variant).toBe('success');

      // WhatsApp: falló por falta de teléfono
      const badgeInvalidPhone = getNotificationStatusBadge({
        channel: 'whatsapp',
        status: 'failed',
        metadata: { manual: true, stage: 'failed' },
      });
      expect(badgeInvalidPhone.label).toBe('Teléfono no válido');
      expect(badgeInvalidPhone.variant).toBe('danger');

      // Email: entregado por Brevo
      const badgeEmailSent = getNotificationStatusBadge({
        channel: 'email',
        status: 'sent',
      });
      expect(badgeEmailSent.label).toBe('Enviada (Brevo)');
      expect(badgeEmailSent.variant).toBe('success');

      // Email: fallido
      const badgeEmailFailed = getNotificationStatusBadge({
        channel: 'email',
        status: 'failed',
      });
      expect(badgeEmailFailed.label).toBe('Falló el envío');
      expect(badgeEmailFailed.variant).toBe('danger');
    });
  });

  describe('9. Trazabilidad de Correo (computeEmailTraceability) y Reintento Idempotente (verifyAndRetryEmailNotification)', () => {
    describe('computeEmailTraceability', () => {
      it('debe retornar not_required cuando contact_preference es exclusivamente whatsapp', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'whatsapp',
            buyers: { email: 'comprador@example.com' },
          },
          []
        );
        expect(summary.status).toBe('not_required');
        expect(summary.label).toBe('No requerido');
        expect(summary.canRetry).toBe(false);
        expect(summary.isAlreadyProcessed).toBe(false);
      });

      it('debe retornar not_required cuando el comprador no tiene correo registrado', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'both',
            buyers: { email: null },
          },
          []
        );
        expect(summary.status).toBe('not_required');
        expect(summary.canRetry).toBe(false);
      });

      it('debe retornar pending sin opción de reintento si la orden está por validar (esperando aprobación)', () => {
        const summary = computeEmailTraceability(
          {
            status: 'pending_verification',
            contact_preference: 'both',
            buyers: { email: 'carlos@example.com' },
          },
          []
        );
        expect(summary.status).toBe('pending');
        expect(summary.canRetry).toBe(false);
      });

      it('debe retornar pending con opción de reintento si la orden está pagada pero no tiene log de correo', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'email',
            buyers: { email: 'carlos@example.com' },
          },
          []
        );
        expect(summary.status).toBe('pending');
        expect(summary.canRetry).toBe(true);
      });

      it('debe retornar sent con isAlreadyProcessed=true y sin reintento si el correo fue enviado (aceptado por Brevo)', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'both',
            buyers: { email: 'carlos@example.com' },
          },
          [
            {
              id: 'log_em_01',
              order_id: 'ord_1',
              channel: 'email',
              event_type: 'payment_approved',
              recipient: 'carlos@example.com',
              status: 'sent',
              attempts: 1,
              created_at: '2026-09-25T10:00:00Z',
              error_message: null,
              idempotency_key: 'key_1',
              metadata: { messageId: '<20260925-brevo-123@smtp.brevo.com>' },
              updated_at: '2026-09-25T10:00:00Z',
            },
          ]
        );
        expect(summary.status).toBe('sent');
        expect(summary.label).toBe('Enviado (Aceptado por Brevo)');
        expect(summary.isAlreadyProcessed).toBe(true);
        expect(summary.canRetry).toBe(false);
        expect(summary.messageId).toBe('<20260925-brevo-123@smtp.brevo.com>');
        expect(summary.recipientMasked).toBe('c***s@example.com');
      });

      it('debe retornar delivered con isAlreadyProcessed=true si el correo fue entregado', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'both',
            buyers: { email: 'carlos@example.com' },
          },
          [
            {
              id: 'log_em_deliv',
              order_id: 'ord_1',
              channel: 'email',
              event_type: 'payment_approved',
              recipient: 'carlos@example.com',
              status: 'delivered',
              attempts: 1,
              created_at: '2026-09-25T10:00:00Z',
              error_message: null,
              idempotency_key: 'key_deliv',
              metadata: { messageId: 'msg_deliv_456' },
              updated_at: '2026-09-25T10:00:00Z',
            },
          ]
        );
        expect(summary.status).toBe('delivered');
        expect(summary.label).toBe('Entregado');
        expect(summary.isAlreadyProcessed).toBe(true);
        expect(summary.canRetry).toBe(false);
      });

      it('debe retornar failed con canRetry=true si el correo falló y la orden está pagada', () => {
        const summary = computeEmailTraceability(
          {
            status: 'paid',
            contact_preference: 'both',
            buyers: { email: 'carlos@example.com' },
          },
          [
            {
              id: 'log_em_err',
              order_id: 'ord_1',
              channel: 'email',
              event_type: 'payment_approved',
              recipient: 'carlos@example.com',
              status: 'failed',
              attempts: 1,
              created_at: '2026-09-25T10:00:00Z',
              error_message: 'Fallo al autenticar con Brevo',
              idempotency_key: 'key_err',
              metadata: null,
              updated_at: '2026-09-25T10:00:00Z',
            },
          ]
        );
        expect(summary.status).toBe('failed');
        expect(summary.label).toBe('Fallido');
        expect(summary.canRetry).toBe(true);
        expect(summary.isAlreadyProcessed).toBe(false);
        expect(summary.errorMessage).toBe('Fallo al autenticar con Brevo');
      });
    });

    describe('verifyAndRetryEmailNotification (Blindaje e Idempotencia)', () => {
      it('debe rechazar reintento si la orden no se encuentra en base de datos', async () => {
        const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });
        const mockSelect = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
        });

        vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

        const result = await verifyAndRetryEmailNotification('ord_not_found', 'payment_approved');
        expect(result.success).toBe(false);
        expect(result.error).toContain('No se pudo verificar el estado actual de la orden');
      });

      it('debe rechazar reintento si la orden no continúa en estado "paid" para payment_approved', async () => {
        const mockOrder = { id: 'ord_not_paid', status: 'pending_verification', contact_preference: 'both' };
        const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: mockOrder, error: null });
        const mockSelect = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
        });

        vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

        const result = await verifyAndRetryEmailNotification('ord_not_paid', 'payment_approved');
        expect(result.success).toBe(false);
        expect(result.error).toContain("La orden debe encontrarse en estado pagada ('paid')");
      });

      it('debe rechazar reintento si el comprador seleccionó exclusivamente WhatsApp', async () => {
        const mockOrder = { id: 'ord_wa_only', status: 'paid', contact_preference: 'whatsapp' };
        const mockMaybeSingle = vi.fn().mockResolvedValueOnce({ data: mockOrder, error: null });
        const mockSelect = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
        });

        vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

        const result = await verifyAndRetryEmailNotification('ord_wa_only', 'payment_approved');
        expect(result.success).toBe(false);
        expect(result.error).toContain('El correo no es requerido');
      });

      it('debe proteger contra duplicados silenciosos y retornar "Correo ya procesado" si ya existe sent o delivered', async () => {
        const mockOrder = { id: 'ord_dup', status: 'paid', contact_preference: 'both' };
        const mockMaybeSingleOrder = vi.fn().mockResolvedValueOnce({ data: mockOrder, error: null });
        const mockExistingLog = [{ status: 'sent', metadata: { messageId: 'm1' } }];

        vi.mocked(supabase.from).mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingleOrder }),
              }),
            } as any;
          }
          if (table === 'notification_logs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValueOnce({ data: mockExistingLog, error: null }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        const result = await verifyAndRetryEmailNotification('ord_dup', 'payment_approved');
        expect(result.success).toBe(false);
        expect(result.alreadyProcessed).toBe(true);
        expect(result.error).toContain('Correo ya procesado');
      });

      it('debe invocar el reenvío de correo transaccional si la orden continúa paid y no ha sido entregada', async () => {
        const mockOrder = { id: 'ord_ok', status: 'paid', contact_preference: 'both' };
        const mockMaybeSingleOrder = vi.fn().mockResolvedValueOnce({ data: mockOrder, error: null });
        const mockExistingLogs = [{ status: 'failed', metadata: null }];

        vi.mocked(supabase.from).mockImplementation((table: string) => {
          if (table === 'orders') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingleOrder }),
              }),
            } as any;
          }
          if (table === 'notification_logs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValueOnce({ data: mockExistingLogs, error: null }),
                  }),
                }),
              }),
            } as any;
          }
          return {} as any;
        });

        (supabase.functions.invoke as any).mockResolvedValueOnce({
          data: { success: true, messageId: 'brevo_retried_ok' },
          error: null,
        });

        const result = await verifyAndRetryEmailNotification('ord_ok', 'payment_approved', {
          buyerEmail: 'carlos@example.com',
          buyerName: 'Carlos Pérez',
          orderReference: 'MAN-2026-001',
        });

        expect(result.success).toBe(true);
        expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
          body: expect.objectContaining({
            orderId: 'ord_ok',
            eventType: 'payment_approved',
            isRetry: true,
          }),
        });
      });
    });

    describe('maskEmail', () => {
      it('debe enmascarar correos electrónicos protegiendo la privacidad', () => {
        expect(maskEmail('carlos.perez@example.com')).toBe('c***z@example.com');
        expect(maskEmail('ana@gmail.com')).toBe('a***a@gmail.com');
        expect(maskEmail('ab@test.com')).toBe('a*@test.com');
        expect(maskEmail('')).toBe('');
        expect(maskEmail(null)).toBe('');
      });
    });
  });
});

