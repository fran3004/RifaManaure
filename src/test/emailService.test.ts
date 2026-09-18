import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendPaymentReceivedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
  retryOrderEmail,
  getOrderEmailLogs,
  ResendEmailProvider,
  defaultEmailProvider,
} from '@/services/emailService';
import { supabase } from '@/lib/supabase';

// Mock de Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe('Servicio de Correo Transaccional Resend (src/services/emailService.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Instanciación y Configuración del Proveedor', () => {
    it('debe instanciar ResendEmailProvider con el nombre descriptivo correcto', () => {
      const provider = new ResendEmailProvider();
      expect(provider.name).toContain('Resend');
      expect(provider.name).toContain('Supabase Edge Functions');
    });
  });

  describe('Validación de Parámetros', () => {
    it('debe rechazar el envío si orderId está vacío', async () => {
      const result = await sendPaymentReceivedEmail('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('identificador de la orden es obligatorio');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  describe('PAYMENT_RECEIVED', () => {
    it('debe invocar send-transactional-email con eventType PAYMENT_RECEIVED', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          emailId: 'email_rec_123',
          status: 'sent',
        },
        error: null,
      });

      const result = await sendPaymentReceivedEmail('ord_test_001');

      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-transactional-email', {
        body: {
          orderId: 'ord_test_001',
          eventType: 'PAYMENT_RECEIVED',
          reason: undefined,
          isRetry: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_rec_123');
      expect(result.status).toBe('sent');
    });
  });

  describe('PAYMENT_APPROVED', () => {
    it('debe invocar send-transactional-email con eventType PAYMENT_APPROVED', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          emailId: 'email_app_456',
          status: 'sent',
        },
        error: null,
      });

      const result = await sendPaymentApprovedEmail('ord_test_002');

      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-transactional-email', {
        body: {
          orderId: 'ord_test_002',
          eventType: 'PAYMENT_APPROVED',
          reason: undefined,
          isRetry: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_app_456');
    });
  });

  describe('PAYMENT_REJECTED', () => {
    it('debe enviar el motivo del rechazo en el cuerpo de la petición', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          emailId: 'email_rej_789',
          status: 'sent',
        },
        error: null,
      });

      const result = await sendPaymentRejectedEmail(
        'ord_test_003',
        'Comprobante ilegible o no identificado en cuenta'
      );

      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-transactional-email', {
        body: {
          orderId: 'ord_test_003',
          eventType: 'PAYMENT_REJECTED',
          reason: 'Comprobante ilegible o no identificado en cuenta',
          isRetry: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_rej_789');
    });
  });

  describe('Reintentos (retryOrderEmail)', () => {
    it('debe enviar la bandera isRetry en true', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          emailId: 'email_retry_999',
          status: 'sent',
        },
        error: null,
      });

      const result = await retryOrderEmail('ord_test_004', 'PAYMENT_APPROVED');

      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-transactional-email', {
        body: {
          orderId: 'ord_test_004',
          eventType: 'PAYMENT_APPROVED',
          reason: undefined,
          isRetry: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_retry_999');
    });
  });

  describe('Control de Errores y Excepciones', () => {
    it('debe manejar errores devueltos por la Edge Function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'RESEND_API_KEY no está configurada en los secretos de Supabase.',
        } as any,
      });

      const result = await sendPaymentApprovedEmail('ord_test_error');

      expect(result.success).toBe(false);
      expect(result.error).toContain('RESEND_API_KEY no está configurada');
    });

    it('debe manejar respuesta sin datos desde la función', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await sendPaymentApprovedEmail('ord_test_nodata');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se recibió respuesta');
    });

    it('debe atrapar excepciones inesperadas de red sin romper la ejecución', async () => {
      vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(
        new Error('Network connection timeout')
      );

      const result = await sendPaymentReceivedEmail('ord_test_neterr');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network connection timeout');
    });
  });

  describe('Historial de Trazabilidad (getOrderEmailLogs)', () => {
    it('debe consultar notification_logs para la orden correspondiente', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValueOnce({
        data: [
          {
            id: 'log_01',
            order_id: 'ord_123',
            channel: 'email',
            event_type: 'payment_approved',
            status: 'sent',
            resend_email_id: 're_abc123',
            created_at: '2026-09-18T10:00:00Z',
          },
        ],
        error: null,
      });

      vi.mocked(supabase.from).mockReturnValueOnce({
        select: mockSelect,
      } as any);
      mockSelect.mockReturnValueOnce({
        eq: mockEq,
      } as any);
      mockEq.mockReturnValueOnce({
        order: mockOrder,
      } as any);

      const logs = await getOrderEmailLogs('ord_123');

      expect(supabase.from).toHaveBeenCalledWith('notification_logs');
      expect(logs).toHaveLength(1);
      expect(logs[0].resend_email_id).toBe('re_abc123');
    });
  });

  describe('Casos de Idempotencia y Respuestas Cacheadas', () => {
    it('debe procesar correctamente una respuesta con cached: true sin reenvíos', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          emailId: 're_cached_999',
          status: 'sent',
          cached: true,
        },
        error: null,
      });

      const result = await sendPaymentReceivedEmail('ord_cached_001');

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.emailId).toBe('re_cached_999');
      expect(result.status).toBe('sent');
    });
  });

  describe('Simulación de Reglas de Seguridad Backend y Validaciones de Edge Function', () => {
    it('debe propagar error de validación cuando el orderId es un UUID malformado o ausente', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'El parámetro orderId es obligatorio y debe ser un UUID válido.',
        },
        error: null,
      });

      const result = await defaultEmailProvider.sendOrderEmail('id-invalido', 'PAYMENT_RECEIVED');
      expect(result.success).toBe(false);
      expect(result.error).toContain('UUID válido');
    });

    it('debe propagar error de autorización cuando un usuario no administrador intenta PAYMENT_APPROVED', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'Acceso no autorizado: la operación solicitada requiere permisos de administrador.',
        } as any,
      });

      const result = await sendPaymentApprovedEmail('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
      expect(result.success).toBe(false);
      expect(result.error).toContain('requiere permisos de administrador');
    });

    it('debe propagar error cuando el comprador no tiene un email válido registrado', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error:
            'El comprador asociado a la orden no tiene una dirección de correo electrónico válida.',
        },
        error: null,
      });

      const result = await sendPaymentReceivedEmail('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
      expect(result.success).toBe(false);
      expect(result.error).toContain('dirección de correo electrónico válida');
    });

    it('debe propagar error cuando el estado de la orden no coincide con el evento solicitado', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: "No se puede enviar email de aprobación porque la orden está en estado 'pending'.",
        },
        error: null,
      });

      const result = await sendPaymentApprovedEmail('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
      expect(result.success).toBe(false);
      expect(result.error).toContain("en estado 'pending'");
    });

    it('debe propagar error de Resend API (ej. 403 sandbox o 500 upstream)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'You can only send testing emails to your own email address.',
          status: 'failed',
        },
        error: null,
      });

      const result = await sendPaymentReceivedEmail('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('You can only send testing emails');
    });
  });

  describe('Lógica de Estados de Webhook de Resend (Simulación de Mapeo)', () => {
    const mapWebhookEventToStatus = (type: string): string | null => {
      switch (type) {
        case 'email.sent':
          return 'sent';
        case 'email.delivered':
          return 'delivered';
        case 'email.bounced':
          return 'bounced';
        case 'email.complained':
          return 'complained';
        case 'email.failed':
          return 'failed';
        default:
          return null;
      }
    };

    it('debe mapear correctamente todos los eventos soportados por Resend', () => {
      expect(mapWebhookEventToStatus('email.sent')).toBe('sent');
      expect(mapWebhookEventToStatus('email.delivered')).toBe('delivered');
      expect(mapWebhookEventToStatus('email.bounced')).toBe('bounced');
      expect(mapWebhookEventToStatus('email.complained')).toBe('complained');
      expect(mapWebhookEventToStatus('email.failed')).toBe('failed');
    });

    it('debe ignorar eventos no transaccionales sin romper el flujo (retornando null)', () => {
      expect(mapWebhookEventToStatus('email.opened')).toBeNull();
      expect(mapWebhookEventToStatus('email.clicked')).toBeNull();
      expect(mapWebhookEventToStatus('unknown.event')).toBeNull();
    });
  });
});
