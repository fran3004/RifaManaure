import { supabase } from '@/lib/supabase';
import type { Database } from '@/database.types';
import type { OrderRow } from '@/types/raffle.types';

export type BuyerRow = Database['public']['Tables']['buyers']['Row'];

export interface BuyerItem {
  id: string;
  full_name: string;
  document_id: string;
  phone: string;
  email: string;
  city: string;
  created_at: string;
  updated_at: string;
  total_orders_count?: number;
  paid_orders_count?: number;
  total_spent?: number;
  total_tickets?: number;
}

export interface BuyerTicketItem {
  id: string;
  ticket_number: string;
  status: string;
  order_id: string | null;
}

export interface BuyerOrderSummary {
  id: string;
  reference: string;
  total_amount: number;
  ticket_count: number;
  status: string;
  payment_method: string;
  receipt_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
  raffle_id: string;
  raffle_title?: string;
  raffle_draw_date?: string;
  tickets?: BuyerTicketItem[];
}

export interface FetchBuyersParams {
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface FetchBuyersResponse {
  buyers: BuyerItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UpdateBuyerAdminParams {
  fullName: string;
  phone: string;
  email: string;
  city: string;
}

export interface UpdateBuyerAdminResult {
  success: boolean;
  error?: string;
  buyer?: BuyerItem;
}

/**
 * Consulta la lista de compradores registrados con paginación en servidor y búsqueda integrada.
 */
export async function fetchBuyersPaginated(
  params: FetchBuyersParams = {}
): Promise<FetchBuyersResponse> {
  const { searchTerm = '', page = 1, pageSize = 20 } = params;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
      .from('buyers')
      .select('*, orders(id, status, total_amount, ticket_count)', { count: 'exact' });

    const trimmed = searchTerm.trim();
    if (trimmed) {
      query = query.or(
        `document_id.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,email.ilike.%${trimmed}%,city.ilike.%${trimmed}%`
      );
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[buyerService] Error al consultar compradores:', error);
      return {
        buyers: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 1,
      };
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // Procesar agregados de órdenes por comprador
    interface RawBuyerWithOrders extends BuyerRow {
      orders?: Array<Pick<OrderRow, 'id' | 'status' | 'total_amount' | 'ticket_count'>>;
    }

    const rawList = (data || []) as unknown as RawBuyerWithOrders[];

    const buyers: BuyerItem[] = rawList.map((b) => {
      const orders = b.orders || [];
      const totalOrders = orders.length;
      const paidOrders = orders.filter((o) => o.status === 'paid');
      const totalSpent = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalTickets = paidOrders.reduce((sum, o) => sum + (Number(o.ticket_count) || 0), 0);

      return {
        id: b.id,
        full_name: b.full_name,
        document_id: b.document_id,
        phone: b.phone,
        email: b.email,
        city: b.city,
        created_at: b.created_at,
        updated_at: b.updated_at,
        total_orders_count: totalOrders,
        paid_orders_count: paidOrders.length,
        total_spent: totalSpent,
        total_tickets: totalTickets,
      };
    });

    return {
      buyers,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error('[buyerService] Error inesperado en fetchBuyersPaginated:', err);
    return {
      buyers: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 1,
    };
  }
}

/**
 * Obtiene el historial completo de órdenes y boletos asociados a un comprador específico.
 */
export async function fetchBuyerOrdersHistory(buyerId: string): Promise<{
  success: boolean;
  orders: BuyerOrderSummary[];
  error?: string;
}> {
  if (!buyerId) {
    return { success: false, orders: [], error: 'ID de comprador no suministrado.' };
  }

  try {
    // 1. Consultar órdenes del comprador
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        receipt_url,
        created_at,
        verified_at,
        rejection_reason,
        raffle_id,
        raffles:raffle_id (
          id,
          title,
          draw_date
        )
      `
      )
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('[buyerService] Error al consultar órdenes del comprador:', ordersError);
      return { success: false, orders: [], error: ordersError.message };
    }

    // 2. Consultar boletos del comprador
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, number, status, order_id')
      .eq('buyer_id', buyerId);

    if (ticketsError) {
      console.warn('[buyerService] Advertencia al consultar boletos del comprador:', ticketsError);
    }

    const ticketsByOrder: Record<string, BuyerTicketItem[]> = {};
    (ticketsData || []).forEach((t) => {
      const orderId = t.order_id || 'unassigned';
      if (!ticketsByOrder[orderId]) {
        ticketsByOrder[orderId] = [];
      }
      ticketsByOrder[orderId].push({
        id: t.id,
        ticket_number: t.number,
        status: t.status,
        order_id: t.order_id,
      });
    });

    interface RawOrderWithRaffle extends OrderRow {
      raffles?:
        | {
            id: string;
            title: string;
            draw_date: string;
          }
        | Array<{ id: string; title: string; draw_date: string }>
        | null;
    }

    const rawOrders = (ordersData || []) as unknown as RawOrderWithRaffle[];

    const orders: BuyerOrderSummary[] = rawOrders.map((o) => {
      const raffleInfo = Array.isArray(o.raffles) ? o.raffles[0] : o.raffles;

      return {
        id: o.id,
        reference: o.reference,
        total_amount: Number(o.total_amount) || 0,
        ticket_count: Number(o.ticket_count) || 0,
        status: o.status,
        payment_method: o.payment_method || 'transfer_manual',
        receipt_url: o.receipt_url,
        created_at: o.created_at,
        verified_at: o.verified_at,
        rejection_reason: o.rejection_reason,
        raffle_id: o.raffle_id,
        raffle_title: raffleInfo?.title || 'Rifa Principal',
        raffle_draw_date: raffleInfo?.draw_date,
        tickets: ticketsByOrder[o.id] || [],
      };
    });

    return { success: true, orders };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Error inesperado al consultar historial de órdenes.';
    return { success: false, orders: [], error: msg };
  }
}

/**
 * Actualiza los datos de contacto de un comprador mediante la RPC administrativa segura `admin_update_buyer`.
 */
export async function updateBuyerAdmin(
  buyerId: string,
  params: UpdateBuyerAdminParams
): Promise<UpdateBuyerAdminResult> {
  if (!buyerId) {
    return { success: false, error: 'ID de comprador requerido.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_buyer', {
      p_buyer_id: buyerId,
      p_full_name: params.fullName.trim(),
      p_phone: params.phone.trim(),
      p_email: params.email.trim().toLowerCase(),
      p_city: params.city.trim(),
    });

    if (error) {
      console.error('[buyerService] Error en admin_update_buyer:', error);
      return {
        success: false,
        error: error.message || 'Error al actualizar comprador en el servidor.',
      };
    }

    const res = data as {
      success: boolean;
      error?: string;
      buyer_id?: string;
      full_name?: string;
      document_id?: string;
      phone?: string;
      email?: string;
      city?: string;
    };

    if (!res?.success) {
      return {
        success: false,
        error: res?.error || 'No fue posible actualizar los datos del comprador.',
      };
    }

    return {
      success: true,
      buyer: {
        id: buyerId,
        full_name: res.full_name || params.fullName,
        document_id: res.document_id || '',
        phone: res.phone || params.phone,
        email: res.email || params.email,
        city: res.city || params.city,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al actualizar comprador.';
    return { success: false, error: msg };
  }
}
