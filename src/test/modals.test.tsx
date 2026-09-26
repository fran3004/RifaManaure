import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';

// Mock createPortal to render inline during tests
vi.mock('react-dom', async () => {
  const actual: any = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (children: any) => children,
  };
});

// Mock Supabase
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

import { AdminBuyerOrdersModal } from '../components/admin/buyers/AdminBuyerOrdersModal';
import { AdminEditBuyerModal } from '../components/admin/buyers/AdminEditBuyerModal';
import { AdminOrderReviewModal } from '../components/admin/orders/AdminOrderReviewModal';
import { AdminEditRaffleModal } from '../components/admin/raffles/AdminEditRaffleModal';
import { AdminInviteUserModal } from '../components/admin/settings/AdminInviteUserModal';
import { AdminRegisterWinnerModal } from '../components/admin/winners/AdminRegisterWinnerModal';
import { DigitalReceiptModal } from '../components/receipt/DigitalReceiptModal';

describe('7 Modales Clonados - Integridad y Renderizado en Contexto Real', () => {
  beforeAll(() => {
    // Provide window mock for SSR / Node environment
    (globalThis as any).window = {
      location: {
        origin: 'http://localhost:5173',
      },
      matchMedia: () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
      }),
    };
    (globalThis as any).document = {
      body: {},
      createElement: () => ({}),
    };
  });

  it('1. AdminBuyerOrdersModal debe renderizar su estructura de shell', () => {
    const buyer: any = {
      id: 'b-1',
      full_name: 'María Gómez',
      document_id: '1098765432',
      phone: '3001112233',
      email: 'maria@ejemplo.com',
      total_orders: 2,
      total_tickets: 5,
      total_spent: 100000,
      created_at: '2026-01-01',
    };
    const html = renderToString(
      React.createElement(AdminBuyerOrdersModal, {
        buyer,
        isOpen: true,
        onClose: () => {},
      })
    );
    expect(html).toContain('María Gómez');
    expect(html).toContain('1098765432');
  });

  it('2. AdminEditBuyerModal debe renderizar backdrop, card, header y footer', () => {
    const buyer: any = {
      id: 'b-2',
      full_name: 'Carlos Ruiz',
      document_id: '80123456',
      phone: '3109876543',
      email: 'carlos@ejemplo.com',
    };
    const html = renderToString(
      React.createElement(AdminEditBuyerModal, {
        buyer,
        isOpen: true,
        onClose: () => {},
        onSuccess: () => {},
      })
    );
    expect(html).toContain('Editar Datos del Comprador');
    expect(html).toContain('Carlos Ruiz');
  });

  it('3. AdminOrderReviewModal debe renderizar revisión de orden con acciones y badges', () => {
    const order: any = {
      id: 'ord-123',
      reference: 'REF-789',
      buyers: {
        full_name: 'Pedro Infante',
        phone: '3001234567',
        email: 'pedro@test.com',
        document_id: '12345678',
      },
      total_amount: 50000,
      total_amount_cop: 50000,
      currency: 'COP',
      status: 'pending',
      created_at: '2026-02-01T10:00:00Z',
      tickets: [{ number: '001' }, { number: '002' }],
    };
    const html = renderToString(
      React.createElement(AdminOrderReviewModal, {
        order,
        isOpen: true,
        onClose: () => {},
        onOrderUpdated: () => {},
      })
    );
    expect(html).toContain('Revisión Administrativa de Orden');
    expect(html).toContain('REF-789');
    expect(html).toContain('Pedro Infante');
  });

  it('4. AdminEditRaffleModal debe renderizar formulario con caparazón modal', () => {
    const raffle: any = {
      id: 'raf-1',
      title: 'Gran Rifa Manaure 2026',
      description: 'Hermosa experiencia en el norte',
      total_tickets: 1000,
      ticket_price: 25000,
      ticket_price_cop: 25000,
      status: 'active',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    };
    const html = renderToString(
      React.createElement(AdminEditRaffleModal, {
        raffle,
        isOpen: true,
        onClose: () => {},
        onSuccess: () => {},
      })
    );
    expect(html).toContain('Gran Rifa Manaure 2026');
  });

  it('5. AdminInviteUserModal debe renderizar opciones de rol e invitación', () => {
    const html = renderToString(
      React.createElement(AdminInviteUserModal, {
        isOpen: true,
        onClose: () => {},
        onUserInvited: async () => {},
      })
    );
    expect(html).toContain('Autorizar Nuevo Administrador');
  });

  it('6. AdminRegisterWinnerModal debe renderizar selector de ganador y caparazón reconociendo la fecha de la rifa de forma inmutable', () => {
    const html = renderToString(
      React.createElement(AdminRegisterWinnerModal, {
        isOpen: true,
        raffles: [
          {
            id: 'raf-1',
            title: 'Rifa Oficial',
            status: 'active',
            draw_date: '2026-12-31T20:00:00Z',
          } as any,
        ],
        onClose: () => {},
        onWinnerRegistered: () => {},
      })
    );
    expect(html).toContain('Registrar Ganador');
    expect(html).toContain('Oficial de la Rifa');
    expect(html).toContain('2026-12-31');
    expect(html).toContain('readonly');
  });

  it('7. DigitalReceiptModal (Contexto Dual: Público y Admin) debe renderizar recibo digital', () => {
    const receiptData: any = {
      orderReference: 'REC-999',
      orderStatus: 'paid',
      createdAt: '2026-03-01T12:00:00Z',
      totalAmount: 50000,
      ticketCount: 1,
      buyerName: 'Ana Mendoza',
      buyerDocumentMasked: 'CC ****432',
      raffleTitle: 'Rifa Aniversario',
      lotteryReference: 'Sorteo Medellín',
      drawDate: '2026-12-31',
      ticketNumbers: ['777'],
    };
    const html = renderToString(
      React.createElement(DigitalReceiptModal, {
        receiptData,
        isOpen: true,
        onClose: () => {},
      })
    );
    expect(html).toContain('Comprobante Digital Oficial');
    expect(html).toContain('REC-999');
  });
});
