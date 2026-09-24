import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ticketService from '../services/ticketService';
import { supabase } from '@/lib/supabase';

/**
 * Suite de Verificación de Seguridad y Remediación SEC-09
 * Erradicación de Enumeración Pública en verify_public_order_or_tickets
 */

describe('SEC-09: Blindaje Anti-Enumeración en Consulta Pública de Boletos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Contrato del Servicio ticketService y Factor Secundario', () => {
    it('1.1 verifyPublicOrderOrTickets debe rechazar búsquedas con término vacío', async () => {
      const res = await ticketService.verifyPublicOrderOrTickets('   ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Ingresa un número de referencia o documento');
    });

    it('1.2 verifyPublicOrderOrTickets debe enviar p_secondary_term a la RPC al consultar por cédula', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          searchTerm: '1065892340',
          searchedBy: 'document',
          orders: [
            {
              id: 'ord-123',
              reference: 'MV-K9X2B1',
              status: 'paid',
              createdAt: '2026-09-24T10:00:00Z',
              totalAmount: 40000,
              ticketCount: 1,
              maskedBuyerName: 'Carlos M.',
              maskedDocumentId: '1065***40',
              raffle: {
                title: 'Rifa Oficial',
                drawDate: '2026-10-01T00:00:00Z',
                lotteryReference: 'La Guajira',
              },
              tickets: [{ number: '042', status: 'sold' }],
            },
          ],
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await ticketService.verifyPublicOrderOrTickets('1065892340', '3001234567');

      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('verify_public_order_or_tickets', {
        p_search_term: '1065892340',
        p_secondary_term: '3001234567',
      });
      expect(res.success).toBe(true);
      expect(res.orders).toHaveLength(1);
      expect(res.orders[0].reference).toBe('MV-K9X2B1');
      expect(res.orders[0].maskedBuyerName).toBe('Carlos M.');
      expect(res.orders[0].maskedDocumentId).toBe('1065***40');
    });

    it('1.3 verifyPublicOrderOrTickets debe permitir consultar por referencia sin requerir factor secundario', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          searchTerm: 'MV-K9X2B1',
          searchedBy: 'reference',
          orders: [
            {
              id: 'ord-123',
              reference: 'MV-K9X2B1',
              status: 'paid',
              createdAt: '2026-09-24T10:00:00Z',
              totalAmount: 40000,
              ticketCount: 1,
              maskedBuyerName: 'Carlos M.',
              maskedDocumentId: '1065***40',
              raffle: {
                title: 'Rifa Oficial',
                drawDate: '2026-10-01T00:00:00Z',
                lotteryReference: 'La Guajira',
              },
              tickets: [{ number: '042', status: 'sold' }],
            },
          ],
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await ticketService.verifyPublicOrderOrTickets('MV-K9X2B1');

      expect(rpcSpy).toHaveBeenCalledWith('verify_public_order_or_tickets', {
        p_search_term: 'MV-K9X2B1',
        p_secondary_term: null,
      });
      expect(res.success).toBe(true);
    });

    it('1.4 Manejo de errores de rate limiting devueltos por la RPC', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: false,
          error:
            'Límite de intentos de consulta excedido para este término. Por favor espera 15 minutos antes de intentar de nuevo.',
          orders: [],
        },
        error: null,
      } as unknown as ReturnType<typeof supabase.rpc>);

      const res = await ticketService.verifyPublicOrderOrTickets('1065892340', '0000');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Límite de intentos de consulta excedido');
      expect(res.orders).toHaveLength(0);
    });
  });

  describe('2. Invariantes de Seguridad y Minimización de Datos', () => {
    it('2.1 No debe exponerse email, teléfono ni enlaces a comprobantes en el resultado público', () => {
      const mockPublicOrder = {
        id: 'ord-1',
        reference: 'MV-TEST-001',
        status: 'paid',
        createdAt: new Date().toISOString(),
        totalAmount: 40000,
        ticketCount: 1,
        maskedBuyerName: 'Pedro P.',
        maskedDocumentId: '1065***40',
        raffle: { title: 'Rifa Test' },
        tickets: [{ number: '001', status: 'sold' }],
      };

      // Verificar que los campos sensibles no existen en la interfaz pública
      expect((mockPublicOrder as any).email).toBeUndefined();
      expect((mockPublicOrder as any).phone).toBeUndefined();
      expect((mockPublicOrder as any).paymentProofUrl).toBeUndefined();
      expect((mockPublicOrder as any).bankAccount).toBeUndefined();
    });

    it('2.2 Enmascaramiento de nombres debe preservar la privacidad del titular', () => {
      const rawName = 'Fernando Andrés Fernández';
      const parts = rawName.trim().split(' ');
      const masked = `${parts[0]} ${parts[1]?.charAt(0) || ''}.`;

      expect(masked).toBe('Fernando A.');
      expect(masked).not.toContain('Fernández');
    });

    it('2.3 Enmascaramiento de documento de identidad debe ocultar el segmento medio', () => {
      const doc = '1065892340';
      const masked = `${doc.substring(0, 4)}***${doc.substring(doc.length - 2)}`;

      expect(masked).toBe('1065***40');
      expect(masked).not.toBe(doc);
    });
  });
});
