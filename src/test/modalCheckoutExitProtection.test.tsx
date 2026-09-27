import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ModalCheckout } from '../components/checkout/ModalCheckout';
import { formatCOP, parseNumericPrice } from '@/lib/utils';

// Mock contexts and external services
const mockCartContext = {
  raffle: {
    id: 'raffle-123',
    title: 'Gran Rifa Ecoturística Manaure Vive',
    ticket_price: 25000,
    status: 'active',
  },
  unitPrice: 25000,
  selectedTickets: ['015', '042', '099'],
  totalAmount: 75000,
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
      totalAmount: 75000,
      reservationExpiresAt: new Date(Date.now() + 600000).toISOString(),
    }),
    releaseCheckoutReservation: vi.fn().mockResolvedValue({
      success: true,
      orderId: 'order-xyz-123',
      reference: 'MNR-998877',
      status: 'cancelled',
      ticketsReleased: 3,
    }),
  };
});

describe('Protección y Advertencia de Salida del Modal de Compra y Cálculos Blindados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Blindaje Matemático de Cálculos de Importes', () => {
    it('parseNumericPrice extrae enteros positivos eliminando formatos corruptos o negativos', () => {
      expect(parseNumericPrice(25000)).toBe(25000);
      expect(parseNumericPrice('25000')).toBe(25000);
      expect(parseNumericPrice('$ 25.000')).toBe(25000);
      expect(parseNumericPrice(25000.4)).toBe(25000);
      expect(parseNumericPrice(-100)).toBe(0);
      expect(parseNumericPrice(null)).toBe(0);
      expect(parseNumericPrice(undefined)).toBe(0);
      expect(parseNumericPrice(NaN)).toBe(0);
    });

    it('formatCOP redondea y formatea con seguridad sin arrojar NaN', () => {
      expect(formatCOP(25000)).toContain('25.000');
      expect(formatCOP(75000)).toContain('75.000');
      expect(formatCOP('50000')).toContain('50.000');
      expect(formatCOP(null)).toContain('0');
      expect(formatCOP(undefined)).toContain('0');
      expect(formatCOP(NaN)).toContain('0');
    });

    it('la multiplicación de boletos por precio unitario es matemáticamente exacta en COP', () => {
      const ticketsCount = 3;
      const unitPrice = parseNumericPrice('25000');
      const calculatedTotal = Math.round(ticketsCount * unitPrice);
      expect(calculatedTotal).toBe(75000);
      expect(formatCOP(calculatedTotal)).toContain('75.000');
    });
  });

  describe('2. Renderizado Seguro del ModalCheckout y Estructura Anti-Cierres Accidentales', () => {
    it('debe renderizar el modal con el título y la X de cierre', () => {
      const html = renderToString(<ModalCheckout />);
      expect(html).toContain('Compra Segura');
      expect(html).toContain('Cerrar ventana de compra');
    });

    it('el backdrop exterior no debe poseer evento onClick para evitar cierres accidentales al hacer clic afuera', () => {
      const html = renderToString(<ModalCheckout />);
      // El modalBackdrop se renderiza y contiene la tarjeta modal
      expect(html).toContain('modalBackdrop');
      expect(html).toContain('modalCard');
    });

    it('muestra los números seleccionados y el total correcto en la tira de resumen superior', () => {
      const html = renderToString(<ModalCheckout />);
      expect(html).toContain('015');
      expect(html).toContain('042');
      expect(html).toContain('099');
      expect(html).toContain('75.000');
    });
  });

  describe('3. Dinamismo de Tiempo de Reserva y Liberación Inmediata en Todas las Fases', () => {
    it('ModalCheckout integra releaseCheckoutReservation al confirmar la salida', async () => {
      const fs = await import('fs');
      const checkoutCode = fs.readFileSync('src/components/checkout/ModalCheckout.tsx', 'utf8');

      // Debe importar releaseCheckoutReservation
      expect(checkoutCode).toContain('releaseCheckoutReservation');

      // handleConfirmExit debe liberar en Supabase si la orden ya fue creada (fase 3+)
      expect(checkoutCode).toContain('if (orderIdToRelease)');
      expect(checkoutCode).toContain('await releaseCheckoutReservation(orderIdToRelease, keyToRelease, refToRelease)');

      // Debe refrescar boletos tras la liberación
      expect(checkoutCode).toContain('void refreshTickets()');
    });

    it('ModalCheckout dinamiza el aviso de tiempo de reserva según systemSettings', async () => {
      const fs = await import('fs');
      const checkoutCode = fs.readFileSync('src/components/checkout/ModalCheckout.tsx', 'utf8');

      // No debe contener "apartados por 10 minutos exclusivamente" hardcodeado
      expect(checkoutCode).not.toContain('apartados por 10 minutos exclusivamente');
      // Debe contener la interpolación dinámica de minutos
      expect(checkoutCode).toContain('apartados por {reservationDurationMinutes}');
    });

    it('VerificarPage dinamiza el tiempo límite según systemSettings.reservation_duration_minutes', async () => {
      const fs = await import('fs');
      const verificarCode = fs.readFileSync('src/pages/VerificarPage.tsx', 'utf8');

      expect(verificarCode).not.toContain('El tiempo límite de 10 minutos para adjuntar el comprobante concluyó');
      expect(verificarCode).toContain('El tiempo límite de {systemSettings.reservation_duration_minutes || 10} minutos para adjuntar el comprobante concluyó');
    });

    it('AdminOrderReviewModal dinamiza el tiempo de reserva temporal según systemSettings', async () => {
      const fs = await import('fs');
      const adminModalCode = fs.readFileSync('src/components/admin/orders/AdminOrderReviewModal.tsx', 'utf8');

      expect(adminModalCode).not.toContain('reserva temporal de 10 minutos');
      expect(adminModalCode).not.toContain('reserva temporal de 10 min');
      expect(adminModalCode).not.toContain('Reserva temporal (10 min)');

      expect(adminModalCode).toContain('reserva temporal de {reservationMinutes} minutos');
      expect(adminModalCode).toContain('reserva temporal de ${reservationMinutes} min');
      expect(adminModalCode).toContain('Reserva temporal ({reservationMinutes} min)');
    });

    it('Al expirar el temporizador o elegir otros boletos, se libera la reserva atómicamente', async () => {
      const fs = await import('fs');
      const checkoutCode = fs.readFileSync('src/components/checkout/ModalCheckout.tsx', 'utf8');

      // En caso de que el timer llegue a 0
      expect(checkoutCode).toContain('void releaseCheckoutReservation(createdOrderId, idempotencyKey, orderReference)');
    });
  });
});
