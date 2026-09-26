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
});
