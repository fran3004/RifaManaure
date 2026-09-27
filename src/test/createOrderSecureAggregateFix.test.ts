import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createOrder } from '@/services/ticketService';
import { supabase } from '@/lib/supabase';

// Mock de Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Auditoría y Corrección de Bloqueo Pesimista en create_order_secure (PostgreSQL Error 0A000)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const readSql = (relativePath: string) => {
    return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');
  };

  describe('1. Verificación Estructural del Script SQL (Migraciones 071 y 065)', () => {
    const migration071 = readSql('supabase/migrations/071_fix_create_order_secure_aggregate_for_update.sql');
    const migration065 = readSql('supabase/migrations/065_auto_close_raffle_on_draw_date.sql');

    it('no debe incluir la cláusula FOR UPDATE directamente sobre funciones agregadas (array_agg)', () => {
      // Patrón prohibido que causa: ERROR 0A000: FOR UPDATE is not allowed with aggregate functions
      const invalidPattern = /SELECT\s+array_agg\([^)]+\)\s+INTO\s+v_ticket_ids\s+FROM[^{;]+FOR\s+UPDATE;/i;
      expect(migration071).not.toMatch(invalidPattern);
      expect(migration065).not.toMatch(invalidPattern);
    });

    it('debe aislar el bloqueo pesimista en una CTE (locked_tickets) y agregar en la consulta externa', () => {
      expect(migration071).toContain('WITH locked_tickets AS (');
      expect(migration071).toContain('FOR UPDATE');
      expect(migration071).toContain('SELECT array_agg(id), count(*)');
      expect(migration071).toContain('INTO v_ticket_ids, v_locked_count');
      expect(migration071).toContain('FROM locked_tickets;');

      expect(migration065).toContain('WITH locked_tickets AS (');
      expect(migration065).toContain('FROM locked_tickets;');
    });

    it('debe mantener search_path seguro, SECURITY DEFINER y permisos para anon, authenticated y service_role', () => {
      expect(migration071).toContain('SECURITY DEFINER');
      expect(migration071).toContain('SET search_path = pg_catalog, public, extensions, pg_temp');
      expect(migration071).toContain('REVOKE ALL ON FUNCTION public.create_order_secure');
      expect(migration071).toContain('GRANT EXECUTE ON FUNCTION public.create_order_secure');
      expect(migration071).toContain('TO anon, authenticated, service_role');
    });

    it('debe verificar la fecha límite de sorteo (draw_date) previniendo compras en ediciones cerradas', () => {
      expect(migration071).toContain('v_raffle.draw_date IS NOT NULL AND v_raffle.draw_date <= NOW()');
      expect(migration071).toContain("'RAFFLE_CLOSED_EXPIRED'");
    });

    it('debe registrar el evento transaccional en audit_logs tras una reserva exitosa', () => {
      expect(migration071).toContain("'ORDER_CREATED_SECURE'");
      expect(migration071).toContain('INSERT INTO public.audit_logs');
    });
  });

  describe('2. Integración de ticketService.createOrder con la RPC de Supabase', () => {
    const validBuyer = {
      fullName: 'Carlos Fernández',
      documentId: '12345678',
      phone: '3001234567',
      email: 'carlos@example.com',
      city: 'Manaure',
    };

    it('debe mapear correctamente la respuesta exitosa con referencia generada por PostgreSQL', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-1234-uuid',
          reference: 'MAN-260927-ABC123',
          buyer_id: 'buy-5678-uuid',
          total_amount: 40000,
          ticket_count: 2,
          reservation_expires_at: '2026-09-27T15:00:00Z',
          idempotency_replayed: false,
        },
        error: null,
      } as any);

      const result = await createOrder('raf-1234', validBuyer, ['024', '025']);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('ord-1234-uuid');
      expect(result.reference).toBe('MAN-260927-ABC123');
      expect(result.totalAmount).toBe(40000);
      expect(result.idempotencyReplayed).toBe(false);

      expect(supabase.rpc).toHaveBeenCalledWith('create_order_secure', expect.objectContaining({
        p_raffle_id: 'raf-1234',
        p_ticket_numbers: ['024', '025'],
        p_buyer_data: expect.objectContaining({
          fullName: 'Carlos Fernández',
          documentId: '12345678',
        }),
      }));
    });

    it('debe manejar adecuadamente la detección de boletos no disponibles (TICKETS_UNAVAILABLE)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          code: 'TICKETS_UNAVAILABLE',
          error: 'Uno o más números ya no se encuentran disponibles.',
          unavailable_numbers: ['024'],
        },
        error: null,
      } as any);

      const result = await createOrder('raf-1234', validBuyer, ['024', '025']);

      expect(result.success).toBe(false);
      expect(result.code).toBe('TICKETS_UNAVAILABLE');
      expect(result.error).toBe('Uno o más números ya no se encuentran disponibles.');
    });

    it('debe capturar y normalizar errores de PostgREST (como el antiguo 0A000) sin lanzar excepciones no controladas', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: '0A000',
          message: 'FOR UPDATE is not allowed with aggregate functions',
        },
      } as any);

      const result = await createOrder('raf-1234', validBuyer, ['024', '025']);

      expect(result.success).toBe(false);
      expect(result.code).toBe('0A000');
      expect(result.error).toBe('Error al procesar la reserva de boletos.');
    });

    it('debe respetar la llave de idempotencia si el cliente reintenta una reserva idéntica', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          order_id: 'ord-1234-uuid',
          reference: 'MAN-260927-ABC123',
          buyer_id: 'buy-5678-uuid',
          total_amount: 40000,
          ticket_count: 2,
          reservation_expires_at: '2026-09-27T15:00:00Z',
          idempotency_replayed: true,
        },
        error: null,
      } as any);

      const result = await createOrder(
        'raf-1234',
        validBuyer,
        ['024', '025'],
        undefined,
        'transfer_manual',
        'both',
        undefined,
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(result.success).toBe(true);
      expect(result.idempotencyReplayed).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('create_order_secure', expect.objectContaining({
        p_client_idempotency_key: '550e8400-e29b-41d4-a716-446655440000',
      }));
    });
  });
});

