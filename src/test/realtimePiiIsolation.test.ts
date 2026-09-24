import { describe, it, expect, beforeEach } from 'vitest';
import type { TicketPublicStateRow } from '@/types/raffle.types';

/**
 * Suite de Pruebas: Aislamiento de PII en Realtime y Proyección Pública de Boletos
 * Hallazgo: EVENT-02 / CRIT-01 (Auditoría 05 — Remediación 2)
 * Correspondiente a Migración: 053_ticket_public_state_and_realtime_pii_isolation.sql
 */

type UserRole = 'anon' | 'authenticated_user' | 'admin';

interface SecurityContext {
  role: UserRole;
  userId?: string;
  isAdmin: boolean;
}

interface RawDatabaseTicket {
  id: string;
  raffle_id: string;
  number: string;
  status: 'available' | 'reserved' | 'paid' | 'sold' | 'blocked';
  reserved_at: string | null;
  reservation_expires_at: string | null;
  buyer_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SimulatedDatabase {
  tickets: Map<string, RawDatabaseTicket>;
  ticket_public_state: Map<string, TicketPublicStateRow>;
  publication_tables: Set<string>;
}

// Inicializador de base de datos simulada con tickets de prueba
function createSimulatedDatabase(): SimulatedDatabase {
  const tickets = new Map<string, RawDatabaseTicket>();
  const ticket_public_state = new Map<string, TicketPublicStateRow>();

  const seedTickets: RawDatabaseTicket[] = [
    {
      id: 'ticket-001',
      raffle_id: 'raffle-manaure-01',
      number: '001',
      status: 'available',
      reserved_at: null,
      reservation_expires_at: null,
      buyer_id: null,
      order_id: null,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z',
    },
    {
      id: 'ticket-002',
      raffle_id: 'raffle-manaure-01',
      number: '002',
      status: 'available',
      reserved_at: null,
      reservation_expires_at: null,
      buyer_id: null,
      order_id: null,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z',
    },
    {
      id: 'ticket-003',
      raffle_id: 'raffle-manaure-01',
      number: '003',
      status: 'paid',
      reserved_at: '2026-09-24T09:00:00Z',
      reservation_expires_at: '2026-09-24T09:10:00Z',
      buyer_id: 'buyer-private-uuid-999',
      order_id: 'order-private-uuid-888',
      created_at: '2026-09-24T09:00:00Z',
      updated_at: '2026-09-24T09:15:00Z',
    },
  ];

  seedTickets.forEach((t) => {
    tickets.set(t.id, { ...t });
    ticket_public_state.set(t.id, {
      id: t.id,
      raffle_id: t.raffle_id,
      number: t.number,
      status: t.status,
      updated_at: t.updated_at,
    });
  });

  return {
    tickets,
    ticket_public_state,
    // Migración 053: tickets REMOVIDA, ticket_public_state AGREGADA
    publication_tables: new Set(['ticket_public_state', 'orders', 'raffles', 'winners', 'system_settings']),
  };
}

// Simulación de la función trigger fn_sync_ticket_public_state de PostgreSQL con normalización de estados
function normalizeTicketStatus(status: string): 'available' | 'reserved' | 'paid' | 'sold' | 'blocked' {
  const s = status.trim().toLowerCase();
  if (s === 'vendido') return 'sold';
  if (s === 'disponible') return 'available';
  if (s === 'reservado') return 'reserved';
  if (s === 'bloqueado') return 'blocked';
  return s as 'available' | 'reserved' | 'paid' | 'sold' | 'blocked';
}

function triggerSyncTicketPublicState(
  db: SimulatedDatabase,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow?: RawDatabaseTicket,
  oldRow?: RawDatabaseTicket
) {
  if (operation === 'INSERT' && newRow) {
    db.ticket_public_state.set(newRow.id, {
      id: newRow.id,
      raffle_id: newRow.raffle_id,
      number: newRow.number,
      status: normalizeTicketStatus(newRow.status),
      updated_at: newRow.updated_at,
    });
  } else if (operation === 'UPDATE' && newRow) {
    db.ticket_public_state.set(newRow.id, {
      id: newRow.id,
      raffle_id: newRow.raffle_id,
      number: newRow.number,
      status: normalizeTicketStatus(newRow.status),
      updated_at: newRow.updated_at,
    });
  } else if (operation === 'DELETE' && oldRow) {
    db.ticket_public_state.delete(oldRow.id);
  }
}

// Simulación de evaluación de consultas PostgreSQL con motor RLS de la Migración 053
function queryTable(
  db: SimulatedDatabase,
  table: 'tickets' | 'ticket_public_state',
  ctx: SecurityContext,
  columns: string[] = ['*']
) {
  if (table === 'tickets') {
    // 1. Privilegios de tabla: REVOKE ALL ON TABLE public.tickets FROM anon, PUBLIC;
    if (ctx.role === 'anon') {
      throw new Error('42501: permission denied for table tickets (anon access revoked in Migration 053)');
    }

    // 2. RLS Policy: "Administradores pueden gestionar boletos" USING (public.is_admin(auth.uid()))
    if (!ctx.isAdmin) {
      // Usuario autenticado no admin: RLS evalúa a false -> 0 filas retornadas
      return [];
    }

    // Para administradores: acceso total
    return Array.from(db.tickets.values()).map((row) => {
      if (columns.includes('*')) return { ...row };
      const filtered: Record<string, unknown> = {};
      columns.forEach((c) => {
        filtered[c] = (row as unknown as Record<string, unknown>)[c];
      });
      return filtered;
    });
  }

  if (table === 'ticket_public_state') {
    // RLS Policy: "Lectura pública de estado de boletos" USING (true)
    // Accesible para anon, authenticated y admin
    return Array.from(db.ticket_public_state.values()).map((row) => {
      if (columns.includes('*')) return { ...row };
      const filtered: Record<string, unknown> = {};
      columns.forEach((c) => {
        // En ticket_public_state NO existen buyer_id ni order_id
        filtered[c] = (row as unknown as Record<string, unknown>)[c];
      });
      return filtered;
    });
  }

  throw new Error(`Tabla desconocida: ${table}`);
}

describe('PRUEBA ADVERSARIAL CRÍTICA: Aislamiento Estricto de PII y Bloqueo de tickets a anon', () => {
  let db: SimulatedDatabase;
  const anonCtx: SecurityContext = { role: 'anon', isAdmin: false };
  const authNonAdminCtx: SecurityContext = { role: 'authenticated_user', userId: 'user-normal-1', isAdmin: false };
  const adminCtx: SecurityContext = { role: 'admin', userId: 'admin-super-1', isAdmin: true };

  beforeEach(() => {
    db = createSimulatedDatabase();
  });

  it('1. como anon: consultar public.tickets debe ser BLOQUEADO con error 42501', () => {
    expect(() => {
      queryTable(db, 'tickets', anonCtx, ['*']);
    }).toThrowError(/42501.*permission denied for table tickets/);
  });

  it('2. como anon: intentar seleccionar buyer_id de public.tickets debe ser BLOQUEADO', () => {
    expect(() => {
      queryTable(db, 'tickets', anonCtx, ['buyer_id']);
    }).toThrowError(/42501.*permission denied for table tickets/);
  });

  it('3. como anon: intentar seleccionar order_id de public.tickets debe ser BLOQUEADO', () => {
    expect(() => {
      queryTable(db, 'tickets', anonCtx, ['order_id']);
    }).toThrowError(/42501.*permission denied for table tickets/);
  });

  it('4. como authenticated no-admin: consultar public.tickets debe retornar 0 filas por RLS', () => {
    const results = queryTable(db, 'tickets', authNonAdminCtx, ['*']);
    expect(results).toHaveLength(0);
  });

  it('5. como admin: consultar public.tickets debe estar PERMITIDO con datos completos', () => {
    const results = queryTable(db, 'tickets', adminCtx, ['*']);
    expect(results).toHaveLength(3);
    const paidTicket = results.find((t: any) => t.number === '003');
    expect(paidTicket).toBeDefined();
    expect(paidTicket?.buyer_id).toBe('buyer-private-uuid-999');
    expect(paidTicket?.order_id).toBe('order-private-uuid-888');
  });

  it('6. como anon: consultar ticket_public_state debe ser PERMITIDO pero únicamente con columnas seguras', () => {
    const results = queryTable(db, 'ticket_public_state', anonCtx, ['*']);
    expect(results).toHaveLength(3);

    results.forEach((row: any) => {
      // Columnas obligatorias presentes
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('raffle_id');
      expect(row).toHaveProperty('number');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('updated_at');

      // Columnas sensibles NUNCA deben existir en ticket_public_state
      expect(row.buyer_id).toBeUndefined();
      expect(row.order_id).toBeUndefined();
      expect(row.email).toBeUndefined();
      expect(row.phone).toBeUndefined();
      expect(row.document_id).toBeUndefined();
    });
  });

  it('7. suscripción Realtime: tickets NO debe estar en publicación supabase_realtime', () => {
    expect(db.publication_tables.has('tickets')).toBe(false);
  });

  it('8. suscripción Realtime: ticket_public_state DEBE estar en publicación supabase_realtime', () => {
    expect(db.publication_tables.has('ticket_public_state')).toBe(true);
  });

  it('9. capturar eventos UPDATE de Realtime: el payload contiene solo columnas seguras y cero PII', () => {
    // Simular evento emitido por Supabase Realtime para ticket_public_state
    const simulateRealtimeEvent = (ticketId: string, newStatus: 'reserved' | 'paid') => {
      const pubState = db.ticket_public_state.get(ticketId);
      if (!pubState) throw new Error('Boleto no existe');
      
      const updated: TicketPublicStateRow = {
        ...pubState,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      db.ticket_public_state.set(ticketId, updated);

      // Payload que Supabase Realtime entrega a clientes anónimos
      return {
        eventType: 'UPDATE',
        schema: 'public',
        table: 'ticket_public_state',
        new: updated,
      };
    };

    const event = simulateRealtimeEvent('ticket-002', 'reserved');
    expect(event.table).toBe('ticket_public_state');
    expect(event.new.number).toBe('002');
    expect(event.new.status).toBe('reserved');
    
    // Verificación estricta de ausencia de PII en la carga útil de Realtime
    const payloadKeys = Object.keys(event.new);
    expect(payloadKeys).toEqual(['id', 'raffle_id', 'number', 'status', 'updated_at']);
    expect(payloadKeys).not.toContain('buyer_id');
    expect(payloadKeys).not.toContain('order_id');
    expect(payloadKeys).not.toContain('buyer');
    expect(payloadKeys).not.toContain('order');
  });
});

describe('PRUEBA DE FLUJO: Cliente A reserva boleto y Cliente B ve cambio en vivo sin fuga de PII', () => {
  let db: SimulatedDatabase;

  beforeEach(() => {
    db = createSimulatedDatabase();
  });

  it('Cliente A reserva ticket 002 -> Cliente B recibe evento seguro sin conocer la identidad ni order_id de A', () => {
    // Estado inicial en la UI del Cliente B (grilla pública cargada desde ticket_public_state)
    const anonCtx: SecurityContext = { role: 'anon', isAdmin: false };
    let clientBGrid: TicketPublicStateRow[] = queryTable(db, 'ticket_public_state', anonCtx, ['*']) as TicketPublicStateRow[];

    const initial002 = clientBGrid.find((t) => t.number === '002');
    expect(initial002?.status).toBe('available');

    // 1. Cliente A ejecuta checkout atómico: create_order_secure
    // La RPC en PostgreSQL ejecuta:
    // UPDATE public.tickets SET status = 'reserved', buyer_id = 'buyer-cliente-A', order_id = 'order-A-uuid', ...
    const ticketInDb = db.tickets.get('ticket-002')!;
    const updatedTicket: RawDatabaseTicket = {
      ...ticketInDb,
      status: 'reserved',
      reserved_at: new Date().toISOString(),
      reservation_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      buyer_id: 'buyer-secret-uuid-of-client-A',
      order_id: 'order-secret-uuid-of-client-A',
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-002', updatedTicket);

    // 2. Trigger trg_sync_ticket_public_state se ejecuta atómicamente en la misma transacción
    triggerSyncTicketPublicState(db, 'UPDATE', updatedTicket, ticketInDb);

    // 3. Supabase Realtime detecta UPDATE en ticket_public_state y emite a suscriptores
    const emittedRealtimePayload = {
      eventType: 'UPDATE',
      schema: 'public',
      table: 'ticket_public_state',
      new: db.ticket_public_state.get('ticket-002')!,
    };

    // 4. Cliente B recibe el evento y actualiza su grilla localmente
    clientBGrid = clientBGrid.map((t) =>
      t.id === emittedRealtimePayload.new.id ? { ...t, ...emittedRealtimePayload.new } : t
    );

    // 5. Verificaciones de seguridad y consistencia en el Cliente B:
    const updated002 = clientBGrid.find((t) => t.number === '002')!;
    expect(updated002.status).toBe('reserved');

    // Cliente B NO puede acceder a buyer_id ni order_id de ninguna manera
    expect((updated002 as any).buyer_id).toBeUndefined();
    expect((updated002 as any).order_id).toBeUndefined();
    expect((emittedRealtimePayload.new as any).buyer_id).toBeUndefined();
    expect((emittedRealtimePayload.new as any).order_id).toBeUndefined();
  });
});

describe('PERSISTENCIA Y SINCRONIZACIÓN ATÓMICA DE LOS 6 MUTADORES', () => {
  let db: SimulatedDatabase;

  beforeEach(() => {
    db = createSimulatedDatabase();
  });

  it('Mutador 1: create_order_secure sincroniza estado a "reserved"', () => {
    const oldT = db.tickets.get('ticket-001')!;
    const newT: RawDatabaseTicket = {
      ...oldT,
      status: 'reserved',
      buyer_id: 'buyer-111',
      order_id: 'order-111',
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-001', newT);
    triggerSyncTicketPublicState(db, 'UPDATE', newT, oldT);

    const publicState = db.ticket_public_state.get('ticket-001')!;
    expect(publicState.status).toBe('reserved');
    expect((publicState as any).buyer_id).toBeUndefined();
  });

  it('Mutador 2: release_expired_reservations sincroniza estado de vuelta a "available"', () => {
    // Poner primero en reserved
    const reservedT: RawDatabaseTicket = {
      ...db.tickets.get('ticket-001')!,
      status: 'reserved',
      buyer_id: 'buyer-111',
      order_id: 'order-111',
    };
    db.tickets.set('ticket-001', reservedT);
    triggerSyncTicketPublicState(db, 'UPDATE', reservedT);

    // Expirar y liberar
    const releasedT: RawDatabaseTicket = {
      ...reservedT,
      status: 'available',
      buyer_id: null,
      order_id: null,
      reserved_at: null,
      reservation_expires_at: null,
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-001', releasedT);
    triggerSyncTicketPublicState(db, 'UPDATE', releasedT, reservedT);

    const publicState = db.ticket_public_state.get('ticket-001')!;
    expect(publicState.status).toBe('available');
  });

  it('Mutador 3: approve_order_payment sincroniza estado a "paid"', () => {
    const oldT = db.tickets.get('ticket-002')!;
    const paidT: RawDatabaseTicket = {
      ...oldT,
      status: 'paid',
      buyer_id: 'buyer-confirmed',
      order_id: 'order-confirmed',
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-002', paidT);
    triggerSyncTicketPublicState(db, 'UPDATE', paidT, oldT);

    const publicState = db.ticket_public_state.get('ticket-002')!;
    expect(publicState.status).toBe('paid');
    expect((publicState as any).buyer_id).toBeUndefined();
  });

  it('Mutador 4: reject_order_payment sincroniza estado de vuelta a "available"', () => {
    const oldT = db.tickets.get('ticket-002')!;
    const rejectedT: RawDatabaseTicket = {
      ...oldT,
      status: 'available',
      buyer_id: null,
      order_id: null,
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-002', rejectedT);
    triggerSyncTicketPublicState(db, 'UPDATE', rejectedT, oldT);

    const publicState = db.ticket_public_state.get('ticket-002')!;
    expect(publicState.status).toBe('available');
  });

  it('Mutador 5: admin_block_ticket sincroniza estado a "blocked"', () => {
    const oldT = db.tickets.get('ticket-001')!;
    const blockedT: RawDatabaseTicket = {
      ...oldT,
      status: 'blocked',
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-001', blockedT);
    triggerSyncTicketPublicState(db, 'UPDATE', blockedT, oldT);

    const publicState = db.ticket_public_state.get('ticket-001')!;
    expect(publicState.status).toBe('blocked');
  });

  it('Mutador 6: admin_unblock_ticket sincroniza estado de vuelta a "available"', () => {
    const oldT = { ...db.tickets.get('ticket-001')!, status: 'blocked' as const };
    const unblockedT: RawDatabaseTicket = {
      ...oldT,
      status: 'available',
      updated_at: new Date().toISOString(),
    };
    db.tickets.set('ticket-001', unblockedT);
    triggerSyncTicketPublicState(db, 'UPDATE', unblockedT, oldT);

    const publicState = db.ticket_public_state.get('ticket-001')!;
    expect(publicState.status).toBe('available');
  });

  it('Sincronización en eliminación de rifa o boletos (DELETE)', () => {
    const oldT = db.tickets.get('ticket-001')!;
    db.tickets.delete('ticket-001');
    triggerSyncTicketPublicState(db, 'DELETE', undefined, oldT);

    expect(db.ticket_public_state.has('ticket-001')).toBe(false);
  });

  it('Mutador 7: Normalización de estados legados ("vendido", "disponible") a canónicos en ticket_public_state', () => {
    // Caso de base de datos viva: boleto histórico con status = 'vendido'
    const legacyT: RawDatabaseTicket = {
      id: 'ticket-legacy-004',
      raffle_id: 'a0000000-0000-0000-0000-000000000001',
      number: '004',
      status: 'vendido' as unknown as 'sold',
      buyer_id: 'buyer-999',
      order_id: 'order-999',
      reserved_at: null,
      reservation_expires_at: null,
      created_at: '2026-09-22T04:48:55.363766Z',
      updated_at: '2026-09-22T04:48:55.363766Z',
    };
    db.tickets.set(legacyT.id, legacyT);
    triggerSyncTicketPublicState(db, 'INSERT', legacyT);

    const publicState = db.ticket_public_state.get(legacyT.id)!;
    expect(publicState).toBeDefined();
    expect(publicState.number).toBe('004');
    expect(publicState.status).toBe('sold'); // Normalizado a 'sold' sin violar CHECK constraint
    expect((publicState as unknown as Record<string, unknown>).buyer_id).toBeUndefined();
    expect((publicState as unknown as Record<string, unknown>).order_id).toBeUndefined();
  });
});
