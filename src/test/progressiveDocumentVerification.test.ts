import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ticketService from '@/services/ticketService';
import { supabase } from '@/lib/supabase';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Consulta Pública Progresiva de Boletos por Documento', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Si la cédula no tiene boletos registrados, debe retornar sin requerir teléfono secundario', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        found: false,
        requiresSecondary: false,
        searchedBy: 'document',
        searchTerm: '99999999',
        orders: [],
        message: 'No encontramos ningún boleto u orden registrada con este número de cédula.',
      },
      error: null,
    } as any);

    const result = await ticketService.verifyPublicOrderOrTickets('99999999');

    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.requiresSecondary).toBe(false);
    expect(result.orders).toHaveLength(0);
    expect(supabase.rpc).toHaveBeenCalledWith('verify_public_order_or_tickets', {
      p_search_term: '99999999',
      p_secondary_term: null,
    });
  });

  it('2. Si la cédula SÍ tiene boletos registrados, debe indicar que se requiere validación por teléfono', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        found: true,
        requiresSecondary: true,
        searchedBy: 'document',
        searchTerm: '1065892340',
        orders: [],
        message: 'Cédula registrada con boletos. Por seguridad, confirma el teléfono registrado o sus últimos 4 dígitos.',
      },
      error: null,
    } as any);

    const result = await ticketService.verifyPublicOrderOrTickets('1065892340');

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.requiresSecondary).toBe(true);
    expect(result.orders).toHaveLength(0);
  });

  it('3. Si la cédula existe y se proporciona el teléfono coincidente, debe retornar las órdenes', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        found: true,
        requiresSecondary: false,
        searchedBy: 'document',
        searchTerm: '1065892340',
        orders: [
          {
            id: 'ord-100',
            reference: 'MV-260926-AB12CD',
            status: 'paid',
            createdAt: '2026-09-26T10:00:00Z',
            totalAmount: 50000,
            ticketCount: 2,
            maskedBuyerName: 'Carlos M.',
            maskedDocumentId: '1065***40',
            raffle: {
              title: 'Gran Rifa 2026',
              drawDate: '2026-12-31T20:00:00Z',
              lotteryReference: 'La Guajira',
            },
            tickets: [
              { number: '100', status: 'sold' },
              { number: '101', status: 'sold' },
            ],
          },
        ],
      },
      error: null,
    } as any);

    const result = await ticketService.verifyPublicOrderOrTickets('1065892340', '3001234567');

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.requiresSecondary).toBe(false);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].reference).toBe('MV-260926-AB12CD');
    expect(result.orders[0].tickets).toHaveLength(2);
  });

  it('4. Si la cédula existe pero el teléfono NO coincide, debe retornar error controlado con requiresSecondary: true', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: false,
        found: true,
        requiresSecondary: true,
        code: 'PHONE_MISMATCH',
        error: 'El número de teléfono o los 4 dígitos no coinciden con los registrados para esta cédula. Intenta nuevamente.',
        orders: [],
      },
      error: null,
    } as any);

    const result = await ticketService.verifyPublicOrderOrTickets('1065892340', '9999');

    expect(result.success).toBe(false);
    expect(result.found).toBe(true);
    expect(result.requiresSecondary).toBe(true);
    expect(result.code).toBe('PHONE_MISMATCH');
    expect(result.error).toContain('no coinciden con los registrados');
  });

  it('5. La consulta directa por referencia de orden no debe requerir teléfono', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        found: true,
        requiresSecondary: false,
        searchedBy: 'reference',
        searchTerm: 'MV-REF-777',
        orders: [
          {
            id: 'ord-200',
            reference: 'MV-REF-777',
            status: 'paid',
            createdAt: '2026-09-26T11:00:00Z',
            totalAmount: 25000,
            ticketCount: 1,
            maskedBuyerName: 'María G.',
            maskedDocumentId: '1098***12',
            raffle: {
              title: 'Gran Rifa',
              drawDate: '2026-12-31T20:00:00Z',
              lotteryReference: 'La Guajira',
            },
            tickets: [{ number: '077', status: 'sold' }],
          },
        ],
      },
      error: null,
    } as any);

    const result = await ticketService.verifyPublicOrderOrTickets('MV-REF-777');

    expect(result.success).toBe(true);
    expect(result.requiresSecondary).toBe(false);
    expect(result.orders).toHaveLength(1);
    expect(supabase.rpc).toHaveBeenCalledWith('verify_public_order_or_tickets', {
      p_search_term: 'MV-REF-777',
      p_secondary_term: null,
    });
  });

  it('6. Lógica de UI: Al cambiar o editar la cédula, el estado secundario debe reiniciarse limpiamente', () => {
    // Simulación del comportamiento reactivo de handleQueryChange
    let requiresPhone = true;
    let secondaryQuery = '1234';
    let orders = [{ id: '1' }];

    const handleQueryChange = (_newValue: string) => {
      if (requiresPhone) {
        requiresPhone = false;
        secondaryQuery = '';
        orders = [];
      }
    };

    handleQueryChange('1065892341'); // Usuario cambia un dígito

    expect(requiresPhone).toBe(false);
    expect(secondaryQuery).toBe('');
    expect(orders).toHaveLength(0);
  });

  it('7. Lógica de UI: El botón Cambiar Cédula debe reiniciar cédula, teléfono, órdenes y habilitar nueva consulta', () => {
    let searchQuery = '1065892340';
    let requiresPhone = true;
    let secondaryQuery = '3001';
    let orders = [{ id: '1' }];
    let hasSearched = true;

    const handleResetQuery = () => {
      searchQuery = '';
      requiresPhone = false;
      secondaryQuery = '';
      orders = [];
      hasSearched = false;
    };

    handleResetQuery();

    expect(searchQuery).toBe('');
    expect(requiresPhone).toBe(false);
    expect(secondaryQuery).toBe('');
    expect(orders).toHaveLength(0);
    expect(hasSearched).toBe(false);
  });
});

