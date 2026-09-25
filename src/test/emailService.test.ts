import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldSendEmail,
  shouldSendWhatsApp,
  formatReceiptAttachmentFileName,
  convertCanvasToBase64,
  buildDigitalReceiptDataFromOrder,
  sendTransactionalEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
} from '@/services/emailService';
import { supabase } from '@/lib/supabase';
import * as receiptGen from '@/services/receiptGeneratorService';
import type { OrderWithDetails } from '@/services/paymentService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Servicio de Correo Transaccional (src/services/emailService.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrder: OrderWithDetails = {
    id: 'ord_1234567890',
    reference: 'MAN-2026-999',
    raffle_id: 'raf_111',
    buyer_id: 'buy_222',
    total_amount: 50000,
    ticket_count: 2,
    status: 'paid',
    payment_method: 'transfer_manual',
    payment_gateway_id: 'BAN-12345',
    payment_gateway_data: null,
    receipt_url: 'receipts/test.png',
    rejection_reason: null,
    contact_preference: 'both',
    verified_at: '2026-09-25T10:00:00Z',
    verified_by: 'adm_001',
    client_idempotency_key: 'idem_key_123',
    idempotency_fingerprint: null,
    created_at: '2026-09-25T09:00:00Z',
    updated_at: '2026-09-25T10:00:00Z',
    buyers: {
      id: 'buy_222',
      full_name: 'Ana María Gómez',
      document_id: '1065892340',
      phone: '3001234567',
      email: 'anamaria@example.com',
      city: 'Manaure Balcón del Cesar',
    },
    tickets: [
      { id: 't1', number: '042', status: 'sold' },
      { id: 't2', number: '189', status: 'sold' },
    ],
  };

  describe('1. Filtrado de Preferencias (shouldSendEmail & shouldSendWhatsApp)', () => {
    it('debe enviar correo si la preferencia es "email" o "both"', () => {
      expect(shouldSendEmail('email')).toBe(true);
      expect(shouldSendEmail('both')).toBe(true);
      expect(shouldSendEmail(' EMAIL ')).toBe(true);
      expect(shouldSendEmail('BOTH')).toBe(true);
    });

    it('no debe enviar correo si la preferencia es "whatsapp", null o undefined', () => {
      expect(shouldSendEmail('whatsapp')).toBe(false);
      expect(shouldSendEmail(null)).toBe(false);
      expect(shouldSendEmail(undefined)).toBe(false);
      expect(shouldSendEmail('')).toBe(false);
    });

    it('debe enviar WhatsApp si la preferencia es "whatsapp", "both" o fallback', () => {
      expect(shouldSendWhatsApp('whatsapp')).toBe(true);
      expect(shouldSendWhatsApp('both')).toBe(true);
      expect(shouldSendWhatsApp(null)).toBe(true);
      expect(shouldSendWhatsApp(undefined)).toBe(true);
    });

    it('no debe enviar WhatsApp si la preferencia es estrictamente "email"', () => {
      expect(shouldSendWhatsApp('email')).toBe(false);
    });
  });

  describe('2. Formato de Nombre de Archivo de Comprobante Adjunto', () => {
    it('debe generar el nombre oficial con prefijo Comprobante_ManaureVive_ y extensión png', () => {
      expect(formatReceiptAttachmentFileName('MAN-2026-001')).toBe(
        'Comprobante_ManaureVive_MAN-2026-001.png'
      );
    });

    it('debe sanitizar caracteres especiales en la referencia', () => {
      expect(formatReceiptAttachmentFileName('ORD #99 / 2026')).toBe(
        'Comprobante_ManaureVive_ORD__99___2026.png'
      );
    });
  });

  describe('3. Conversión de Canvas a Base64 Limpio (convertCanvasToBase64)', () => {
    it('debe extraer el contenido base64 removiendo el prefijo data URL si usa toDataURL', async () => {
      const mockCanvas = {
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'),
      } as unknown as HTMLCanvasElement;

      const base64 = await convertCanvasToBase64(mockCanvas);
      expect(base64).toBe('iVBORw0KGgoAAAANSUhEUgAA...');
      expect(base64.startsWith('data:')).toBe(false);
    });

    it('debe soportar toBlob como mecanismo de respaldo', async () => {
      const binaryData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(binaryData.buffer),
      } as unknown as Blob;

      const mockCanvas = {
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob)),
      } as unknown as HTMLCanvasElement;

      const base64 = await convertCanvasToBase64(mockCanvas);
      expect(base64).toBe(btoa('Hello'));
    });

    it('debe rechazar si el objeto canvas es nulo o indefinido', async () => {
      await expect(convertCanvasToBase64(null as unknown as HTMLCanvasElement)).rejects.toThrow(
        'Canvas no válido'
      );
    });
  });

  describe('4. Construcción de Datos de Comprobante (buildDigitalReceiptDataFromOrder)', () => {
    it('debe mapear correctamente los campos de la orden y enmascarar el documento del comprador', () => {
      const receiptData = buildDigitalReceiptDataFromOrder(mockOrder);

      expect(receiptData.orderReference).toBe('MAN-2026-999');
      expect(receiptData.orderStatus).toBe('paid');
      expect(receiptData.buyerName).toBe('Ana María Gómez');
      expect(receiptData.buyerDocumentMasked).toBe('106*****40');
      expect(receiptData.ticketNumbers).toEqual(['042', '189']);
      expect(receiptData.totalAmount).toBe(50000);
      expect(receiptData.ticketCount).toBe(2);
      expect(receiptData.raffleTitle).toBe('Sorteo Oficial Manaure Vive');
    });

    it('debe usar valores seguros si el comprador no tiene documento o nombre', () => {
      const orderWithoutBuyer: OrderWithDetails = {
        ...mockOrder,
        buyers: null,
      };

      const receiptData = buildDigitalReceiptDataFromOrder(orderWithoutBuyer);
      expect(receiptData.buyerName).toBe('Comprador');
      expect(receiptData.buyerDocumentMasked).toBe('***');
    });
  });

  describe('5. Invocación de Edge Function (sendTransactionalEmail)', () => {
    it('debe invocar send-brevo-email con el payload y retornar success y messageId', async () => {
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: {
          success: true,
          messageId: 'brevo_msg_test_123',
        },
        error: null,
      });

      const result = await sendTransactionalEmail({
        orderId: 'ord_123',
        eventType: 'payment_approved',
        receiptPngBase64: 'data:image/png;base64,RAW_BASE_64_STRING',
        receiptFileName: 'Comprobante_ManaureVive_MAN-001.png',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('brevo_msg_test_123');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
        body: {
          orderId: 'ord_123',
          eventType: 'payment_approved',
          receiptPngBase64: 'RAW_BASE_64_STRING', // sanitizado sin data URL
          receiptFileName: 'Comprobante_ManaureVive_MAN-001.png',
          isRetry: undefined,
        },
      });
    });

    it('debe manejar errores retornados por supabase.functions sin propagar excepciones', async () => {
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Error 502: Brevo API timeout',
        },
      });

      const result = await sendTransactionalEmail({
        orderId: 'ord_123',
        eventType: 'payment_approved',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error 502: Brevo API timeout');
    });

    it('debe capturar errores de red inesperados de invoke sin romper la ejecución', async () => {
      (supabase.functions.invoke as any).mockRejectedValueOnce(
        new Error('Network connection failed')
      );

      const result = await sendTransactionalEmail({
        orderId: 'ord_123',
        eventType: 'payment_approved',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection failed');
    });
  });

  describe('6. Flujo de Aprobación de Pago (sendPaymentApprovedEmail)', () => {
    it('debe omitir el despacho si la preferencia del comprador es "whatsapp"', async () => {
      const orderWhatsAppOnly: OrderWithDetails = {
        ...mockOrder,
        contact_preference: 'whatsapp',
      };

      const result = await sendPaymentApprovedEmail(orderWhatsAppOnly);
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('debe generar el canvas y enviar el correo con comprobante si la preferencia incluye email', async () => {
      const fakeCanvas = {
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,FAKE_CANVAS_PNG_DATA'),
      } as unknown as HTMLCanvasElement;

      const spyCanvasGen = vi
        .spyOn(receiptGen, 'generateDigitalReceiptCanvas')
        .mockResolvedValueOnce(fakeCanvas);

      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: { success: true, messageId: 'brevo_appr_999' },
        error: null,
      });

      const result = await sendPaymentApprovedEmail(mockOrder);

      expect(spyCanvasGen).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('brevo_appr_999');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
        body: expect.objectContaining({
          orderId: mockOrder.id,
          eventType: 'payment_approved',
          receiptPngBase64: 'FAKE_CANVAS_PNG_DATA',
          receiptFileName: 'Comprobante_ManaureVive_MAN-2026-999.png',
        }),
      });

      spyCanvasGen.mockRestore();
    });

    it('si la generación de canvas falla, aún debe despachar el correo HTML sin adjunto', async () => {
      const spyCanvasGen = vi
        .spyOn(receiptGen, 'generateDigitalReceiptCanvas')
        .mockRejectedValueOnce(new Error('Canvas rendering unsupported'));

      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: { success: true, messageId: 'brevo_no_attach_001' },
        error: null,
      });

      const result = await sendPaymentApprovedEmail(mockOrder);

      expect(result.success).toBe(true);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
        body: expect.objectContaining({
          orderId: mockOrder.id,
          eventType: 'payment_approved',
          receiptPngBase64: undefined,
        }),
      });

      spyCanvasGen.mockRestore();
    });
  });

  describe('7. Flujo de Rechazo de Pago (sendPaymentRejectedEmail)', () => {
    it('debe omitir el despacho si la preferencia es "whatsapp"', async () => {
      const result = await sendPaymentRejectedEmail('ord_rej_1', 'whatsapp');
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('debe despachar payment_rejected si la preferencia incluye email', async () => {
      (supabase.functions.invoke as any).mockResolvedValueOnce({
        data: { success: true, messageId: 'brevo_rej_001' },
        error: null,
      });

      const result = await sendPaymentRejectedEmail('ord_rej_1', 'email');
      expect(result.success).toBe(true);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-brevo-email', {
        body: expect.objectContaining({
          orderId: 'ord_rej_1',
          eventType: 'payment_rejected',
        }),
      });
    });
  });

  describe('8. Independencia Financiera', () => {
    it('garantiza que fallas en Brevo o red no lancen excepciones no controladas', async () => {
      (supabase.functions.invoke as any).mockRejectedValueOnce(new Error('Brevo service down'));

      // Debe resolver limpiamente con success: false, sin lanzar
      await expect(sendPaymentApprovedEmail(mockOrder)).resolves.toEqual({
        success: false,
        error: 'Brevo service down',
      });
    });
  });
});
