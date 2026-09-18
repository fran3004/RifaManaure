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
  type OrderNotificationData,
} from '@/services/notificationService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
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

      expect(result.whatsappDispatched).toBe(true);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          recipient: 'Sin teléfono',
          error_message: expect.stringContaining('no tiene un número de celular válido'),
        }),
        expect.any(Object)
      );
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

    it('debe fallar y registrar error si no hay teléfono al reintentar', async () => {
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
});

