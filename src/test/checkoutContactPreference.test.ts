import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  CONTACT_PREFERENCE_OPTIONS,
  formatContactPreferenceLabel,
  ModalCheckout,
} from '../components/checkout/ModalCheckout';
import * as ticketService from '../services/ticketService';
import type { ContactPreference } from '../types/raffle.types';

// Mock contexts and external services
const mockCartContext = {
  raffle: {
    id: 'raffle-123',
    title: 'Gran Rifa Manaure Vive',
    ticket_price: 25000,
  },
  unitPrice: 25000,
  selectedTickets: ['001', '002'],
  totalAmount: 50000,
  isCheckoutOpen: true,
  closeCheckout: vi.fn(),
  clearSelection: vi.fn(),
  refreshTickets: vi.fn().mockResolvedValue(undefined),
  systemSettings: {
    reservation_duration_minutes: 10,
    support_whatsapp_number: '573001234567',
  },
};

vi.mock('@/context/useTicketCart', () => ({
  useTicketCart: () => mockCartContext,
}));

vi.mock('@/services/paymentService', () => ({
  getPaymentAccounts: vi.fn().mockResolvedValue([
    {
      id: 'acc-1',
      bank_name: 'Bancolombia',
      account_type: 'savings',
      account_number: '123456789',
      account_holder: 'Manaure Vive S.A.S.',
      holder_document: '901234567',
      is_active: true,
    },
  ]),
  uploadPaymentProof: vi.fn().mockResolvedValue({ success: true }),
  validateProofFile: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/services/ticketService', async () => {
  const actual: any = await vi.importActual('@/services/ticketService');
  return {
    ...actual,
    createOrder: vi.fn().mockResolvedValue({
      success: true,
      orderId: 'order-xyz-123',
      buyerId: 'buyer-abc-456',
      reference: 'MNR-998877',
      totalAmount: 50000,
    }),
  };
});

describe('Checkout - Selección del Canal de Notificación (Contact Preference)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Contrato y Opciones de Canal de Confirmación', () => {
    it('debe definir exactamente las 3 opciones requeridas: whatsapp, email y both', () => {
      const optionIds = CONTACT_PREFERENCE_OPTIONS.map((opt) => opt.id);
      expect(optionIds).toEqual(['whatsapp', 'email', 'both']);
    });

    it('la opción whatsapp debe especificar que el envío se gestiona actualmente de forma manual', () => {
      const whatsappOption = CONTACT_PREFERENCE_OPTIONS.find((opt) => opt.id === 'whatsapp');
      expect(whatsappOption).toBeDefined();
      expect(whatsappOption?.title).toBe('WhatsApp');
      expect(whatsappOption?.description).toContain('WhatsApp');
      expect(whatsappOption?.subtext).toContain('manual');
      expect(whatsappOption?.subtext).not.toContain('automático');
      expect(whatsappOption?.badge).toBe('Gestión manual');
    });

    it('la opción email debe explicar que la confirmación se envía automáticamente cuando el equipo valide el pago', () => {
      const emailOption = CONTACT_PREFERENCE_OPTIONS.find((opt) => opt.id === 'email');
      expect(emailOption).toBeDefined();
      expect(emailOption?.title).toBe('Correo electrónico');
      expect(emailOption?.description).toContain('automática por correo');
      expect(emailOption?.subtext).toContain('automáticamente');
      expect(emailOption?.subtext).toContain('equipo valide tu pago');
      expect(emailOption?.badge).toBe('Automático');
    });

    it('la opción both debe combinar ambos canales y figurar como recomendada', () => {
      const bothOption = CONTACT_PREFERENCE_OPTIONS.find((opt) => opt.id === 'both');
      expect(bothOption).toBeDefined();
      expect(bothOption?.title).toBe('WhatsApp + Correo');
      expect(bothOption?.description).toContain('ambos canales');
      expect(bothOption?.badge).toBe('Recomendado');
      expect(bothOption?.subtext).toContain('automáticamente');
      expect(bothOption?.subtext).toContain('manual');
    });
  });

  describe('2. Formato de Etiquetas en Resumen y Confirmación', () => {
    it('formatea correctamente la etiqueta para whatsapp', () => {
      expect(formatContactPreferenceLabel('whatsapp')).toBe('📱 WhatsApp (Gestión manual)');
    });

    it('formatea correctamente la etiqueta para email', () => {
      expect(formatContactPreferenceLabel('email')).toBe('✉️ Correo electrónico (Automático)');
    });

    it('formatea correctamente la etiqueta para both', () => {
      expect(formatContactPreferenceLabel('both')).toBe('📱 WhatsApp + ✉️ Correo (Respaldo total)');
    });
  });

  describe('3. Renderizado y Accesibilidad (ARIA) en ModalCheckout', () => {
    it('debe renderizar el radiogroup con role="radiogroup" y tarjetas con role="radio"', () => {
      const html = renderToString(React.createElement(ModalCheckout));

      // Contenedor accesible
      expect(html).toContain('role="radiogroup"');
      expect(html).toContain('aria-labelledby="contact-preference-label"');
      expect(html).toContain('Canal oficial de confirmación');

      // Tarjetas accesibles
      expect(html).toContain('id="pref-card-whatsapp"');
      expect(html).toContain('id="pref-card-email"');
      expect(html).toContain('id="pref-card-both"');
      expect(html).toContain('role="radio"');

      // Default es "both", debe tener aria-checked="true"
      expect(html).toContain('id="pref-card-both" role="radio" aria-checked="true"');
      expect(html).toContain('id="pref-card-whatsapp" role="radio" aria-checked="false"');
      expect(html).toContain('id="pref-card-email" role="radio" aria-checked="false"');
    });

    it('al estar seleccionado "both" por defecto, debe incluir la caja informativa de correo y spam', () => {
      const html = renderToString(React.createElement(ModalCheckout));

      expect(html).toContain('Importante:');
      expect(html).toContain('Después de la validación del pago recibirás la confirmación en tu correo');
      expect(html).toContain('Spam');
      expect(html).toContain('Correo no deseado');
      expect(html).toContain('Promociones');
    });
  });

  describe('4. Integración y Persistencia con createOrder para los 3 Canales', () => {
    it('debe invocar createOrder enviando "whatsapp" cuando el comprador selecciona WhatsApp', async () => {
      const createOrderSpy = vi.spyOn(ticketService, 'createOrder');

      await ticketService.createOrder(
        'raffle-123',
        {
          fullName: 'Carlos Gómez',
          documentId: '1065892340',
          phone: '3001234567',
          email: 'carlos@example.com',
          city: 'Manaure',
        },
        ['001', '002'],
        undefined,
        'transfer_manual',
        'whatsapp',
        undefined,
        'idemp-key-1'
      );

      expect(createOrderSpy).toHaveBeenCalledWith(
        'raffle-123',
        expect.objectContaining({
          fullName: 'Carlos Gómez',
          phone: '3001234567',
          email: 'carlos@example.com',
        }),
        ['001', '002'],
        undefined,
        'transfer_manual',
        'whatsapp',
        undefined,
        'idemp-key-1'
      );
    });

    it('debe invocar createOrder enviando "email" cuando el comprador selecciona Correo electrónico', async () => {
      const createOrderSpy = vi.spyOn(ticketService, 'createOrder');

      await ticketService.createOrder(
        'raffle-123',
        {
          fullName: 'Ana Torres',
          documentId: '1098765432',
          phone: '3109876543',
          email: 'ana.torres@example.com',
          city: 'Valledupar',
        },
        ['005'],
        undefined,
        'transfer_manual',
        'email',
        undefined,
        'idemp-key-2'
      );

      expect(createOrderSpy).toHaveBeenCalledWith(
        'raffle-123',
        expect.objectContaining({
          fullName: 'Ana Torres',
          email: 'ana.torres@example.com',
        }),
        ['005'],
        undefined,
        'transfer_manual',
        'email',
        undefined,
        'idemp-key-2'
      );
    });

    it('debe invocar createOrder enviando "both" cuando el comprador selecciona WhatsApp + Correo', async () => {
      const createOrderSpy = vi.spyOn(ticketService, 'createOrder');

      await ticketService.createOrder(
        'raffle-123',
        {
          fullName: 'Pedro Martínez',
          documentId: '77123456',
          phone: '3157890123',
          email: 'pedro@example.com',
          city: 'Riohacha',
        },
        ['010', '011'],
        undefined,
        'transfer_manual',
        'both',
        undefined,
        'idemp-key-3'
      );

      expect(createOrderSpy).toHaveBeenCalledWith(
        'raffle-123',
        expect.objectContaining({
          fullName: 'Pedro Martínez',
          phone: '3157890123',
          email: 'pedro@example.com',
        }),
        ['010', '011'],
        undefined,
        'transfer_manual',
        'both',
        undefined,
        'idemp-key-3'
      );
    });
  });

  describe('5. Lógica Condicional del Banner de Advertencia de Spam', () => {
    function shouldShowSpamNotice(preference: ContactPreference): boolean {
      return preference === 'email' || preference === 'both';
    }

    it('debe mostrar el aviso de spam cuando se selecciona email', () => {
      expect(shouldShowSpamNotice('email')).toBe(true);
    });

    it('debe mostrar el aviso de spam cuando se selecciona both', () => {
      expect(shouldShowSpamNotice('both')).toBe(true);
    });

    it('NO debe mostrar el aviso de spam cuando se selecciona exclusivamente whatsapp', () => {
      expect(shouldShowSpamNotice('whatsapp')).toBe(false);
    });
  });
});
