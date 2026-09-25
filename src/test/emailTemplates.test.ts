import { describe, it, expect } from 'vitest';
import {
  generateTransactionalEmail,
  buildPaymentApprovedEmail,
  buildPaymentRejectedEmail,
  buildPaymentReceivedEmail,
  formatCurrencyCOP,
  formatDateCO,
  formatTicketNumber,
  type EmailTemplateParams,
} from '../../supabase/functions/send-brevo-email/emailTemplates';

describe('Sistema Profesional de Plantillas Transaccionales — Manaure Vive', () => {
  const baseParams: EmailTemplateParams = {
    eventType: 'payment_approved',
    order: {
      id: 'ord-12345',
      reference: 'MAN-2026-789',
      totalAmount: 50000,
      ticketCount: 2,
      status: 'paid',
      confirmedAt: '2026-09-24T20:30:00Z',
    },
    buyer: {
      fullName: 'María Fernanda Ruiz',
      documentId: '1098765432',
      phone: '3157894561',
      email: 'maria.ruiz@example.com',
      city: 'Manaure',
    },
    raffle: {
      title: 'Gran Rifa Manaure Vive 2026',
      drawDate: '2026-12-31T20:00:00Z',
      lotteryReference: 'Lotería de La Guajira',
    },
    tickets: ['42', '588'],
    siteUrl: 'https://staging.manaurevive.com',
    hasAttachment: true,
    supportEmail: 'ayuda@manaurevive.com',
    supportPhone: '+57 300 123 4567',
  };

  describe('1. Formateadores Utilitarios', () => {
    it('debe formatear moneda COP profesional sin decimales', () => {
      expect(formatCurrencyCOP(50000)).toMatch(/\$ 50\.000 COP/);
      expect(formatCurrencyCOP(1250000)).toMatch(/\$ 1\.250\.000 COP/);
    });

    it('debe formatear números de boletos con padding de 3 dígitos', () => {
      expect(formatTicketNumber('7')).toBe('007');
      expect(formatTicketNumber('42')).toBe('042');
      expect(formatTicketNumber('588')).toBe('588');
      expect(formatTicketNumber('1042')).toBe('1042');
    });

    it('debe formatear fechas con localización es-CO', () => {
      const dateStr = formatDateCO('2026-12-31T20:00:00Z');
      expect(dateStr.toLowerCase()).toContain('diciembre');
      expect(dateStr).toContain('2026');
    });
  });

  describe('2. Identidad Visual y Colores de theme-public.css', () => {
    it('debe utilizar la paleta de colores oficial de Manaure Vive y el logo oficial en Cloudinary', () => {
      const result = generateTransactionalEmail(baseParams);

      // Fondo exterior crema cálido (#F4EFE4)
      expect(result.htmlContent).toContain('#F4EFE4');

      // Superficies y tarjetas (#FFFFFF y #FBF8F1)
      expect(result.htmlContent).toContain('#FFFFFF');
      expect(result.htmlContent).toContain('#FBF8F1');

      // Verde bosque institucional (#0F2E1D y #1B4A2E)
      expect(result.htmlContent).toContain('#0F2E1D');
      expect(result.htmlContent).toContain('#1B4A2E');

      // Acento dorado (#F5A623 y #FDF1D8)
      expect(result.htmlContent).toContain('#F5A623');
      expect(result.htmlContent).toContain('#FDF1D8');

      // Logo oficial de Cloudinary
      expect(result.htmlContent).toContain(
        'https://res.cloudinary.com/ky01b0vz/image/upload/f_png,w_240/v1790100541/manaure-vive/marca/logo-principal.png'
      );
    });
  });

  describe('3. Plantilla PAYMENT_APPROVED', () => {
    it('debe generar asunto y contenido visual aprobado según especificación', () => {
      const result = buildPaymentApprovedEmail(baseParams);

      expect(result.subject).toBe('🎉 ¡Tu pago fue confirmado! — Manaure Vive');

      // Saludo personalizado
      expect(result.htmlContent).toContain('Hola, <strong>María Fernanda Ruiz</strong>.');

      // Mensaje destacado
      expect(result.htmlContent).toContain('✅ Pago confirmado y participación registrada.');

      // Resumen y detalles
      expect(result.htmlContent).toContain('MAN-2026-789');
      expect(result.htmlContent).toContain('Gran Rifa Manaure Vive 2026');
      expect(result.htmlContent).toContain('Lotería de La Guajira');
      expect(result.htmlContent).toContain('042');
      expect(result.htmlContent).toContain('588');

      // Botón "Verificar mis números" con URL dinámica sin hardcodear
      expect(result.htmlContent).toContain(
        'https://staging.manaurevive.com/verificar?ref=MAN-2026-789'
      );
      expect(result.htmlContent).toContain('Verificar mis números');

      // Comprobante oficial adjunto
      expect(result.htmlContent).toContain('Comprobante Oficial Adjunto');

      // Advertencia de Spam respetuosa
      expect(result.htmlContent).toContain('Consejo de seguridad:');
      expect(result.htmlContent).toContain('Spam, Correo no deseado o Promociones');

      // Versión de texto plano
      expect(result.textContent).toContain('¡TU PAGO FUE CONFIRMADO! — MANAURE VIVE');
      expect(result.textContent).toContain('Hola, María Fernanda Ruiz.');
      expect(result.textContent).toContain('✅ Pago confirmado y participación registrada.');
      expect(result.textContent).toContain('042, 588');
      expect(result.textContent).toContain('https://staging.manaurevive.com/verificar?ref=MAN-2026-789');
      expect(result.textContent).toContain('CONSEJO DE SEGURIDAD');
    });
  });

  describe('4. Plantilla PAYMENT_REJECTED', () => {
    it('debe generar correo de rechazo con tono profesional, motivo y acciones sugeridas', () => {
      const rejectParams: EmailTemplateParams = {
        ...baseParams,
        eventType: 'payment_rejected',
        order: {
          ...baseParams.order,
          status: 'rejected',
          rejectionReason: 'El valor de la consignación no coincide con el total de la orden.',
        },
      };

      const result = buildPaymentRejectedEmail(rejectParams);

      expect(result.subject).toBe('Actualización sobre tu orden — Manaure Vive (MAN-2026-789)');
      expect(result.htmlContent).toContain('El valor de la consignación no coincide con el total de la orden.');
      expect(result.htmlContent).toContain('¿Qué puedes hacer a continuación?');
      expect(result.htmlContent).toContain('Si ya realizaste la transferencia:');
      expect(result.htmlContent).toContain('Si deseas realizar una nueva compra:');
      expect(result.htmlContent).toContain('No Aprobado');

      // Texto plano
      expect(result.textContent).toContain('ACTUALIZACIÓN SOBRE TU ORDEN — MANAURE VIVE');
      expect(result.textContent).toContain('El valor de la consignación no coincide');
      expect(result.textContent).toContain('¿QUÉ PUEDES HACER?');
    });
  });

  describe('5. Plantilla PAYMENT_RECEIVED', () => {
    it('debe preparar la notificación de comprobante recibido en revisión manual', () => {
      const receivedParams: EmailTemplateParams = {
        ...baseParams,
        eventType: 'payment_received',
        order: {
          ...baseParams.order,
          status: 'pending_verification',
        },
      };

      const result = buildPaymentReceivedEmail(receivedParams);

      expect(result.subject).toBe('Recibimos tu comprobante — Manaure Vive (MAN-2026-789)');
      expect(result.htmlContent).toContain('Recibimos tu comprobante. Ahora será revisado manualmente');
      expect(result.htmlContent).toContain('En proceso de validación');
      expect(result.htmlContent).toContain('042');
      expect(result.htmlContent).toContain('588');

      // Texto plano
      expect(result.textContent).toContain('COMPROBANTE RECIBIDO EN REVISIÓN — MANAURE VIVE');
      expect(result.textContent).toContain('Recibimos tu comprobante. Ahora será revisado manualmente');
    });
  });

  describe('6. Compatibilidad y Limpieza Técnica para Clientes de Correo', () => {
    it('no debe incluir JavaScript ni etiquetas <script>', () => {
      const result = generateTransactionalEmail(baseParams);
      expect(result.htmlContent).not.toContain('<script');
      expect(result.htmlContent).not.toContain('javascript:');
    });

    it('no debe incluir variables CSS (var(--...)) en los estilos inline', () => {
      const result = generateTransactionalEmail(baseParams);
      expect(result.htmlContent).not.toMatch(/var\(--[a-zA-Z0-9_-]+\)/);
    });

    it('debe estructurar el contenido mediante tablas con role="presentation"', () => {
      const result = generateTransactionalEmail(baseParams);
      expect(result.htmlContent).toContain('role="presentation"');
      expect(result.htmlContent).toContain('cellpadding="0"');
      expect(result.htmlContent).toContain('cellspacing="0"');
    });
  });
});
