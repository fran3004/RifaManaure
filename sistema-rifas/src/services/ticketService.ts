import { supabase } from '@/lib/supabase';
import type { TicketRow, RaffleRow } from '@/types/raffle.types';

export interface ReserveTicketsResult {
  success: boolean;
  reservedCount: number;
  failedNumbers: string[];
  reservationExpiresAt: string | null;
  error?: string;
}

export interface BuyerRegistrationData {
  fullName: string;
  documentId: string;
  phone: string;
  email: string;
  city: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  reference?: string;
  buyerId?: string;
  totalAmount?: number;
  reservationExpiresAt?: string;
  error?: string;
}

/**
 * Obtiene la rifa activa principal.
 */
export async function getActiveRaffle(): Promise<RaffleRow | null> {
  try {
    // 1. Intentar obtener la rifa activa principal
    const { data: activeRaffle } = await supabase
      .from('raffles')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRaffle) {
      return activeRaffle as RaffleRow;
    }

    // 2. Si no hay ninguna activa (ej: pausada temporalmente), consultar la más reciente
    const { data: latestRaffle, error } = await supabase
      .from('raffles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error al obtener la información de la rifa:', error);
      return null;
    }

    return (latestRaffle as RaffleRow) || null;
  } catch (err) {
    console.error('Error de red al consultar la rifa:', err);
    return null;
  }
}

/**
 * Obtiene todos los boletos de una rifa específica.
 */
export async function getTickets(raffleId: string): Promise<TicketRow[]> {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('raffle_id', raffleId)
      .order('number', { ascending: true });

    if (error) {
      console.error('Error al cargar boletos:', error);
      return [];
    }

    return (data || []) as TicketRow[];
  } catch (err) {
    console.error('Error de red al cargar boletos:', err);
    return [];
  }
}

/**
 * Reserva boletos de forma atómica en PostgreSQL mediante la función RPC reserve_tickets.
 */
export async function reserveTickets(
  raffleId: string,
  ticketNumbers: string[],
  buyerId: string,
  durationMinutes?: number
): Promise<ReserveTicketsResult> {
  try {
    const { data, error } = await supabase.rpc('reserve_tickets', {
      p_raffle_id: raffleId,
      p_ticket_numbers: ticketNumbers,
      p_buyer_id: buyerId,
      p_duration_minutes: durationMinutes,
    });

    if (error) {
      console.error('Error RPC al reservar boletos:', error);
      return {
        success: false,
        reservedCount: 0,
        failedNumbers: ticketNumbers,
        reservationExpiresAt: null,
        error: error.message,
      };
    }

    const res = data as {
      success: boolean;
      reserved_count: number;
      failed_numbers: string[];
      reservation_expires_at: string;
    };

    return {
      success: res.success,
      reservedCount: res.reserved_count,
      failedNumbers: res.failed_numbers || [],
      reservationExpiresAt: res.reservation_expires_at,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al reservar boletos';
    return {
      success: false,
      reservedCount: 0,
      failedNumbers: ticketNumbers,
      reservationExpiresAt: null,
      error: message,
    };
  }
}

/**
 * Registra o actualiza los datos del comprador.
 */
export async function registerBuyer(buyerData: BuyerRegistrationData): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('buyers')
      .upsert(
        {
          full_name: buyerData.fullName.trim(),
          document_id: buyerData.documentId.trim(),
          phone: buyerData.phone.trim(),
          email: buyerData.email.trim().toLowerCase(),
          city: buyerData.city.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'document_id' }
      )
      .select('id')
      .single();

    if (error) {
      console.error('Error al registrar comprador:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('Error de red al registrar comprador:', err);
    return null;
  }
}

/**
 * Crea una orden de compra de forma segura mediante la RPC create_order_secure en PostgreSQL.
 * El cálculo de total_amount, la reserva atómica y la asignación se ejecutan
 * exclusivamente en el servidor (cero confianza en totales enviados por el cliente).
 */
export async function createOrder(
  raffleId: string,
  buyerIdOrData: string | BuyerRegistrationData,
  ticketNumbers: string[],
  _clientTotalAmountIgnored?: number,
  paymentMethod: 'wompi' | 'bold' | 'mercadopago' | 'transfer_manual' | 'cash' = 'transfer_manual',
  contactPreference: 'whatsapp' | 'email' | 'both' = 'both',
  buyerDataParam?: BuyerRegistrationData
): Promise<CreateOrderResult> {
  try {
    const buyerData = typeof buyerIdOrData === 'object' ? buyerIdOrData : buyerDataParam;

    if (!buyerData) {
      return { success: false, error: 'Datos del comprador requeridos para crear la orden.' };
    }

    const { data, error } = await supabase.rpc('create_order_secure', {
      p_raffle_id: raffleId,
      p_ticket_numbers: ticketNumbers,
      p_buyer_data: {
        fullName: buyerData.fullName.trim(),
        documentId: buyerData.documentId.trim(),
        phone: buyerData.phone.trim(),
        email: buyerData.email.trim().toLowerCase(),
        city: buyerData.city.trim(),
      },
      p_payment_method: paymentMethod,
      p_contact_preference: contactPreference,
    });

    if (error) {
      console.error('Error RPC al crear orden segura:', error);
      return { success: false, error: error.message };
    }

    const res = data as {
      success: boolean;
      order_id?: string;
      reference?: string;
      buyer_id?: string;
      total_amount?: number;
      ticket_count?: number;
      reservation_expires_at?: string;
      error?: string;
    };

    if (!res.success) {
      return { success: false, error: res.error || 'No se pudo generar la orden.' };
    }

    return {
      success: true,
      orderId: res.order_id,
      reference: res.reference,
      buyerId: res.buyer_id,
      totalAmount: res.total_amount,
      reservationExpiresAt: res.reservation_expires_at,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al crear orden';
    return { success: false, error: message };
  }
}

import { maskDocumentId, maskFullName } from '@/lib/utils';

export interface PublicOrderVerification {
  id: string;
  reference: string;
  status:
    | 'pending'
    | 'pending_verification'
    | 'paid'
    | 'completed'
    | 'rejected'
    | 'expired'
    | 'cancelled';
  createdAt: string;
  totalAmount: number;
  ticketCount: number;
  rejectionReason: string | null;
  maskedBuyerName: string;
  maskedDocumentId: string;
  raffle: {
    title: string;
    drawDate: string;
    lotteryReference: string;
  };
  tickets: {
    number: string;
    status: string;
  }[];
}

export interface PublicVerificationResult {
  success: boolean;
  searchedBy: 'reference' | 'document';
  searchTerm: string;
  orders: PublicOrderVerification[];
  error?: string;
}

/**
 * Consulta pública y segura de órdenes y boletos a través de la RPC verify_public_order_or_tickets.
 * Protege estrictamente la privacidad: el enmascarado se realiza en el propio motor SQL,
 * sin exponer jamás comprobantes, teléfonos, correos, datos bancarios ni metadatos administrativos.
 */
export async function verifyPublicOrderOrTickets(
  searchQuery: string
): Promise<PublicVerificationResult> {
  try {
    const raw = searchQuery.trim();
    if (!raw) {
      return {
        success: false,
        searchedBy: 'reference',
        searchTerm: '',
        orders: [],
        error: 'Ingresa un número de referencia o documento de identidad.',
      };
    }

    const { data, error } = await supabase.rpc('verify_public_order_or_tickets', {
      p_search_term: raw,
    });

    if (error) {
      console.warn('Aviso al invocar verify_public_order_or_tickets:', error.message);
      return {
        success: false,
        searchedBy: raw.toUpperCase().startsWith('MV-') ? 'reference' : 'document',
        searchTerm: raw,
        orders: [],
        error: error.message || 'Error al consultar boletos y órdenes.',
      };
    }

    const res = data as {
      success: boolean;
      searchTerm: string;
      searchedBy: 'reference' | 'document';
      orders: any[];
      error?: string;
    };

    if (!res || !res.success) {
      return {
        success: false,
        searchedBy: res?.searchedBy || 'reference',
        searchTerm: raw,
        orders: [],
        error: res?.error || 'No se pudo consultar el estado de los boletos.',
      };
    }

    // Mapeo enriquecido con fallback defensivo
    const formattedOrders: PublicOrderVerification[] = (res.orders || []).map((ord: any) => ({
      id: ord.id,
      reference: ord.reference,
      status: ord.status,
      createdAt: ord.createdAt,
      totalAmount: Number(ord.totalAmount || 0),
      ticketCount: Number(ord.ticketCount || 0),
      rejectionReason: ord.rejectionReason || null,
      maskedBuyerName: ord.maskedBuyerName || maskFullName(ord.buyers?.full_name),
      maskedDocumentId: ord.maskedDocumentId || maskDocumentId(ord.buyers?.document_id),
      raffle: {
        title: ord.raffle?.title || 'Gran Rifa Ecoturística Manaure Vive',
        drawDate: ord.raffle?.drawDate || '',
        lotteryReference: ord.raffle?.lotteryReference || 'Lotería de Santander',
      },
      tickets: (ord.tickets || []).map((t: any) => ({
        number: t.number,
        status: t.status,
      })),
    }));

    return {
      success: true,
      searchedBy: res.searchedBy,
      searchTerm: raw,
      orders: formattedOrders,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al consultar boletos';
    return {
      success: false,
      searchedBy: 'reference',
      searchTerm: searchQuery,
      orders: [],
      error: msg,
    };
  }
}

/**
 * Consulta de compatibilidad sanitizada por documento.
 */
export async function getTicketsByBuyerDocument(documentId: string): Promise<{
  buyer: { fullName: string; phone: string; email: string } | null;
  tickets: {
    number: string;
    status: string;
    raffleTitle: string;
    orderReference: string;
    orderStatus?: string;
  }[];
}> {
  try {
    const res = await verifyPublicOrderOrTickets(documentId);
    if (!res.success || res.orders.length === 0) {
      return { buyer: null, tickets: [] };
    }

    const firstOrder = res.orders[0];
    const allTickets = res.orders.flatMap((o) =>
      o.tickets.map((t) => ({
        number: t.number,
        status: t.status,
        raffleTitle: o.raffle.title,
        orderReference: o.reference,
        orderStatus: o.status,
      }))
    );

    return {
      buyer: {
        fullName: firstOrder.maskedBuyerName,
        phone: '', // Protegido
        email: '', // Protegido
      },
      tickets: allTickets,
    };
  } catch (err) {
    console.error('Error al consultar boletos por documento:', err);
    return { buyer: null, tickets: [] };
  }
}
