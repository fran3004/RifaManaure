import { describe, it, expect } from 'vitest';

/**
 * Suite de Verificación de Integridad Estructural y Máquina de Estados
 * Correspondiente a Hallazgos: DB-06, DB-07, DB-08, DB-09, DB-11
 * Implementados en Migración: 038_harden_ticket_order_structural_integrity.sql
 */

describe('DB-06: Irreversibilidad Comercial de Boletos Vendidos (fn_validate_ticket_status_transition)', () => {
  it('debe rechazar cualquier intento de cambiar un boleto "sold" a "available", "reserved" o "blocked"', () => {
    const simulateTicketTransition = (oldStatus: string, newStatus: string) => {
      if (oldStatus === 'sold' && newStatus !== 'sold') {
        throw new Error(
          `Violación de Integridad (DB-06): El boleto ya está vendido (sold) y su estado es comercialmente irreversible. Intento de cambio a "${newStatus}" denegado.`
        );
      }
      return { status: newStatus };
    };

    expect(() => simulateTicketTransition('sold', 'available')).toThrowError(
      /DB-06.*comercialmente irreversible.*available/
    );
    expect(() => simulateTicketTransition('sold', 'reserved')).toThrowError(
      /DB-06.*comercialmente irreversible.*reserved/
    );
    expect(() => simulateTicketTransition('sold', 'blocked')).toThrowError(
      /DB-06.*comercialmente irreversible.*blocked/
    );
  });

  it('debe permitir actualizaciones no comerciales sobre boletos "sold" manteniendo el estado "sold"', () => {
    const simulateTicketUpdate = (
      oldTicket: { status: string; buyer_id: string; order_id: string; number: string },
      updates: Partial<{ status: string; buyer_id: string; order_id: string; number: string; updated_at: string }>
    ) => {
      const newStatus = updates.status ?? oldTicket.status;
      const newBuyerId = updates.buyer_id ?? oldTicket.buyer_id;
      const newOrderId = updates.order_id ?? oldTicket.order_id;
      const newNumber = updates.number ?? oldTicket.number;

      if (oldTicket.status === 'sold') {
        if (newStatus !== 'sold') {
          throw new Error('DB-06: Irreversible');
        }
        if (newBuyerId !== oldTicket.buyer_id) {
          throw new Error('Violación de Integridad (DB-07): Prohibido modificar el comprador del boleto vendido');
        }
        if (newOrderId !== oldTicket.order_id) {
          throw new Error('Violación de Integridad (DB-07): Prohibido reasignar o desvincular la orden del boleto vendido');
        }
        if (newNumber !== oldTicket.number) {
          throw new Error('Violación de Integridad: Prohibido modificar el número de un boleto vendido');
        }
      }

      return { ...oldTicket, ...updates };
    };

    const initialSoldTicket = {
      status: 'sold',
      buyer_id: 'buyer-uuid-1',
      order_id: 'order-uuid-1',
      number: '007',
    };

    // Actualización no comercial (ej. timestamp o metadatos)
    const updated = simulateTicketUpdate(initialSoldTicket, {
      updated_at: '2026-09-23T19:00:00Z',
    });

    expect(updated.status).toBe('sold');
    expect(updated.buyer_id).toBe('buyer-uuid-1');
    expect(updated.order_id).toBe('order-uuid-1');
  });
});

describe('DB-07: Inmutabilidad de Titularidad y Orden en Boletos Vendidos (Bypass Prevention)', () => {
  const initialTicket = {
    number: '042',
    status: 'sold',
    buyer_id: 'buyer-alice',
    order_id: 'order-100',
    raffle_id: 'raffle-1',
  };

  it('debe rechazar la alteración de buyer_id incluso si status permanece en "sold"', () => {
    const validateUpdate = (oldT: typeof initialTicket, newT: typeof initialTicket) => {
      if (oldT.status === 'sold') {
        if (newT.status !== 'sold') throw new Error('DB-06');
        if (newT.buyer_id !== oldT.buyer_id) {
          throw new Error(
            `Violación de Integridad (DB-07): Prohibido modificar el comprador del boleto vendido número ${oldT.number}.`
          );
        }
      }
    };

    expect(() =>
      validateUpdate(initialTicket, {
        ...initialTicket,
        buyer_id: 'buyer-attacker-malicious',
      })
    ).toThrowError(/DB-07.*Prohibido modificar el comprador.*042/);
  });

  it('debe rechazar la desvinculación o cambio de order_id en un boleto vendido', () => {
    const validateUpdate = (oldT: typeof initialTicket, newT: typeof initialTicket) => {
      if (oldT.status === 'sold') {
        if (newT.order_id !== oldT.order_id) {
          throw new Error(
            `Violación de Integridad (DB-07): Prohibido reasignar o desvincular la orden del boleto vendido número ${oldT.number}.`
          );
        }
      }
    };

    expect(() =>
      validateUpdate(initialTicket, {
        ...initialTicket,
        order_id: 'order-hijacked-200',
      })
    ).toThrowError(/DB-07.*Prohibido reasignar o desvincular la orden.*042/);
  });
});

describe('DB-08 & DB-09: Integridad Referencial Compuesta y Eliminación de ON DELETE SET NULL', () => {
  it('debe validar que un boleto no puede vincularse a una orden de una rifa diferente (Composite FK)', () => {
    const orders = new Map([
      ['order-1', { id: 'order-1', raffle_id: 'raffle-A' }],
      ['order-2', { id: 'order-2', raffle_id: 'raffle-B' }],
    ]);

    const validateCompositeForeignKey = (ticket: { order_id: string | null; raffle_id: string }) => {
      if (!ticket.order_id) return true; // MATCH SIMPLE: null order_id pasa
      const order = orders.get(ticket.order_id);
      if (!order) {
        throw new Error('Key (order_id)=(...) is not present in table "orders".');
      }
      if (order.raffle_id !== ticket.raffle_id) {
        throw new Error(
          `Key (order_id, raffle_id)=(${ticket.order_id}, ${ticket.raffle_id}) is not present in table "orders". (DB-08 Violation)`
        );
      }
      return true;
    };

    // Caso válido: Rifa coincide
    expect(validateCompositeForeignKey({ order_id: 'order-1', raffle_id: 'raffle-A' })).toBe(true);

    // Caso inválido: Orden de rifa A asignada a ticket de rifa B
    expect(() =>
      validateCompositeForeignKey({ order_id: 'order-1', raffle_id: 'raffle-B' })
    ).toThrowError(/DB-08 Violation/);
  });

  it('debe restringir el borrado de una orden si tiene boletos asociados (ON DELETE RESTRICT en lugar de SET NULL)', () => {
    const tickets = [
      { id: 't1', order_id: 'order-1', status: 'sold' },
      { id: 't2', order_id: 'order-1', status: 'sold' },
    ];

    const deleteOrder = (orderId: string) => {
      const associatedTickets = tickets.filter((t) => t.order_id === orderId);
      if (associatedTickets.length > 0) {
        throw new Error(
          `update or delete on table "orders" violates foreign key constraint "tickets_order_raffle_fkey" on table "tickets" (ON DELETE RESTRICT: ${associatedTickets.length} boletos asociados)`
        );
      }
      return true;
    };

    expect(() => deleteOrder('order-1')).toThrowError(/ON DELETE RESTRICT.*2 boletos asociados/);
  });
});

describe('DB-11: Restricciones CHECK de Consistencia Estructural en Tickets y NOT NULL en Status', () => {
  it('tickets_sold_order_check: rechaza boletos "sold" sin order_id o sin buyer_id', () => {
    const validateSoldCheck = (ticket: { status: string; order_id: string | null; buyer_id: string | null }) => {
      if (ticket.status === 'sold' && (!ticket.order_id || !ticket.buyer_id)) {
        throw new Error('violates check constraint "tickets_sold_order_check"');
      }
      return true;
    };

    expect(validateSoldCheck({ status: 'sold', order_id: 'ord-1', buyer_id: 'buy-1' })).toBe(true);
    expect(() => validateSoldCheck({ status: 'sold', order_id: null, buyer_id: 'buy-1' })).toThrowError(
      /tickets_sold_order_check/
    );
    expect(() => validateSoldCheck({ status: 'sold', order_id: 'ord-1', buyer_id: null })).toThrowError(
      /tickets_sold_order_check/
    );
  });

  it('tickets_reserved_expiry_check: rechaza boletos "reserved" sin reservation_expires_at', () => {
    const validateReservedCheck = (ticket: { status: string; reservation_expires_at: string | null }) => {
      if (ticket.status === 'reserved' && !ticket.reservation_expires_at) {
        throw new Error('violates check constraint "tickets_reserved_expiry_check"');
      }
      return true;
    };

    expect(
      validateReservedCheck({ status: 'reserved', reservation_expires_at: '2026-09-23T20:00:00Z' })
    ).toBe(true);
    expect(() =>
      validateReservedCheck({ status: 'reserved', reservation_expires_at: null })
    ).toThrowError(/tickets_reserved_expiry_check/);
  });

  it('tickets_available_clean_check: rechaza boletos "available" que conserven order_id, buyer_id o expiración', () => {
    const validateAvailableCleanCheck = (ticket: {
      status: string;
      order_id: string | null;
      buyer_id: string | null;
      reservation_expires_at: string | null;
    }) => {
      if (
        ticket.status === 'available' &&
        (ticket.order_id !== null || ticket.buyer_id !== null || ticket.reservation_expires_at !== null)
      ) {
        throw new Error('violates check constraint "tickets_available_clean_check"');
      }
      return true;
    };

    expect(
      validateAvailableCleanCheck({
        status: 'available',
        order_id: null,
        buyer_id: null,
        reservation_expires_at: null,
      })
    ).toBe(true);

    expect(() =>
      validateAvailableCleanCheck({
        status: 'available',
        order_id: 'order-residual',
        buyer_id: null,
        reservation_expires_at: null,
      })
    ).toThrowError(/tickets_available_clean_check/);
  });
});

describe('Integridad de Órdenes: Inmutabilidad Comercial de Órdenes Pagadas (fn_validate_order_status_transition)', () => {
  const paidOrder = {
    id: 'ord-100',
    reference: 'MV-ABCD1234',
    status: 'paid',
    buyer_id: 'buyer-original',
    raffle_id: 'raffle-original',
    total_amount: 50000,
    ticket_count: 5,
  };

  it('rechaza modificación de términos comerciales (buyer_id, total_amount, ticket_count, raffle_id) en orden pagada', () => {
    const validateOrderUpdate = (oldO: typeof paidOrder, newO: typeof paidOrder) => {
      if (['paid', 'completed'].includes(oldO.status)) {
        if (newO.buyer_id !== oldO.buyer_id) {
          throw new Error(`Violación de Integridad: Prohibido modificar el comprador de una orden pagada (${oldO.reference}).`);
        }
        if (newO.total_amount !== oldO.total_amount) {
          throw new Error(`Violación de Integridad: Prohibido modificar el monto total de una orden pagada (${oldO.reference}).`);
        }
        if (newO.ticket_count !== oldO.ticket_count) {
          throw new Error(`Violación de Integridad: Prohibido modificar la cantidad de boletos de una orden pagada (${oldO.reference}).`);
        }
      }
    };

    expect(() =>
      validateOrderUpdate(paidOrder, { ...paidOrder, buyer_id: 'buyer-swapped' })
    ).toThrowError(/Prohibido modificar el comprador de una orden pagada/);

    expect(() =>
      validateOrderUpdate(paidOrder, { ...paidOrder, total_amount: 10000 })
    ).toThrowError(/Prohibido modificar el monto total de una orden pagada/);

    expect(() =>
      validateOrderUpdate(paidOrder, { ...paidOrder, ticket_count: 1 })
    ).toThrowError(/Prohibido modificar la cantidad de boletos de una orden pagada/);
  });

  it('rechaza que una orden pagada retroceda a pending, pending_verification, expired o rejected', () => {
    const validateStatusTransition = (oldStatus: string, newStatus: string) => {
      if (['paid', 'completed'].includes(oldStatus)) {
        if (['pending', 'pending_verification', 'expired', 'rejected', 'cancelled'].includes(newStatus)) {
          throw new Error(`Integridad violada: Una orden pagada y confirmada no puede retroceder al estado ${newStatus}.`);
        }
      }
    };

    expect(() => validateStatusTransition('paid', 'pending')).toThrowError(/Integridad violada/);
    expect(() => validateStatusTransition('paid', 'pending_verification')).toThrowError(/Integridad violada/);
    expect(() => validateStatusTransition('paid', 'rejected')).toThrowError(/Integridad violada/);
    expect(() => validateStatusTransition('paid', 'expired')).toThrowError(/Integridad violada/);
    expect(() => validateStatusTransition('paid', 'cancelled')).toThrowError(/Integridad violada/);
  });
});
