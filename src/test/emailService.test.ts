import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendPaymentReceivedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
  retryOrderEmail,
  getOrderEmailLogs,
  ResendEmailProvider,
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
});
