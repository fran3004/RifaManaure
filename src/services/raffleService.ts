import { supabase } from '@/lib/supabase';
import type { RaffleRow } from '@/types/raffle.types';

export interface RaffleWithStats extends RaffleRow {
  available_tickets: number;
  reserved_tickets: number;
  sold_tickets: number;
  blocked_tickets: number;
  total_revenue: number;
  sales_percentage: number;
}

export interface UpdateRaffleParams {
  raffleId: string;
  title: string;
  description: string;
  ticketPrice: number;
  drawDate: string; // ISO string or datetime
  lotteryReference: string;
  status: 'draft' | 'active' | 'paused' | 'closed' | 'finished';
  maxTicketsPerBuyer: number;
}

export interface CreateRaffleParams {
  title: string;
  slug: string;
  description: string;
  ticketPrice: number;
  totalTickets: number;
  maxTicketsPerBuyer: number;
  drawDate: string;
  lotteryReference: string;
  status: 'draft' | 'active' | 'paused' | 'closed' | 'finished';
}

/**
 * Consulta todas las rifas en el sistema junto con sus métricas operativas de boletos.
 */
export async function fetchAdminRaffles(): Promise<{
  success: boolean;
  raffles: RaffleWithStats[];
  error?: string;
}> {
  try {
    const { data: rafflesData, error: rafflesError } = await supabase
      .from('raffles')
      .select('*')
      .order('created_at', { ascending: false });

    if (rafflesError) {
      console.error('[raffleService] Error al consultar rifas:', rafflesError);
      return { success: false, raffles: [], error: rafflesError.message };
    }

    if (!rafflesData || rafflesData.length === 0) {
      return { success: true, raffles: [] };
    }

    // Consultar boletos para calcular estadísticas agregadas por cada rifa
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('tickets')
      .select('raffle_id, status');

    if (ticketsError) {
      console.warn('[raffleService] Error al consultar estadísticas de boletos:', ticketsError);
    }

    const ticketStatsMap: Record<
      string,
      { available: number; reserved: number; sold: number; blocked: number }
    > = {};

    (ticketsData || []).forEach((t) => {
      const rId = t.raffle_id;
      if (!ticketStatsMap[rId]) {
        ticketStatsMap[rId] = { available: 0, reserved: 0, sold: 0, blocked: 0 };
      }
      if (t.status === 'available') ticketStatsMap[rId].available += 1;
      else if (t.status === 'reserved') ticketStatsMap[rId].reserved += 1;
      else if (t.status === 'sold') ticketStatsMap[rId].sold += 1;
      else if (t.status === 'blocked') ticketStatsMap[rId].blocked += 1;
    });

    const enrichedRaffles: RaffleWithStats[] = rafflesData.map((r) => {
      const stats = ticketStatsMap[r.id] || { available: 0, reserved: 0, sold: 0, blocked: 0 };
      const totalTickets =
        r.total_tickets || stats.available + stats.reserved + stats.sold + stats.blocked || 1000;
      const unitPrice = Number(r.ticket_price) || 0;
      const totalRevenue = stats.sold * unitPrice;
      const salesPercentage = totalTickets > 0 ? Math.round((stats.sold / totalTickets) * 100) : 0;

      return {
        ...r,
        available_tickets: stats.available,
        reserved_tickets: stats.reserved,
        sold_tickets: stats.sold,
        blocked_tickets: stats.blocked,
        total_revenue: totalRevenue,
        sales_percentage: salesPercentage,
      };
    });

    return {
      success: true,
      raffles: enrichedRaffles,
    };
  } catch (err) {
    return {
      success: false,
      raffles: [],
      error: err instanceof Error ? err.message : 'Error inesperado al cargar las rifas.',
    };
  }
}

function formatRaffleRpcError(rawError: string, functionName: string): string {
  if (!rawError) return 'Error inesperado al procesar la solicitud.';

  if (
    rawError.includes('schema cache') ||
    rawError.includes('Could not find the function') ||
    rawError.includes('function public.admin_')
  ) {
    console.warn(`[raffleService] RPC '${functionName}' no disponible en el backend:`, rawError);
    return 'El servicio de administración de rifas no está disponible en este momento. Por favor contacta al soporte técnico.';
  }

  if (rawError.includes('Acceso denegado') || rawError.includes('solo administradores')) {
    return 'Acceso denegado: tu cuenta de usuario no tiene permisos de administrador registrados en la tabla admin_users.';
  }

  return rawError;
}

/**
 * Actualiza los parámetros de una rifa mediante la RPC segura admin_update_raffle.
 */
export async function updateRaffleAdmin(
  params: UpdateRaffleParams
): Promise<{ success: boolean; raffle?: RaffleRow; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('admin_update_raffle', {
      p_raffle_id: params.raffleId,
      p_title: params.title.trim(),
      p_description: params.description.trim(),
      p_ticket_price: params.ticketPrice,
      p_draw_date: new Date(params.drawDate).toISOString(),
      p_lottery_reference: params.lotteryReference.trim(),
      p_status: params.status,
      p_max_tickets_per_buyer: params.maxTicketsPerBuyer,
    });

    if (error) {
      console.error('[raffleService] Error en admin_update_raffle:', error);
      return {
        success: false,
        error: formatRaffleRpcError(error.message, 'admin_update_raffle'),
      };
    }

    const response = data as { success: boolean; raffle?: RaffleRow; error?: string } | null;
    if (response?.success && response.raffle) {
      return { success: true, raffle: response.raffle };
    }

    return {
      success: false,
      error: response?.error
        ? formatRaffleRpcError(response.error, 'admin_update_raffle')
        : 'No fue posible guardar los cambios de la rifa.',
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? formatRaffleRpcError(err.message, 'admin_update_raffle')
          : 'Error de conexión al actualizar la rifa.',
    };
  }
}

/**
 * Crea una nueva rifa y genera sus boletos atómicamente mediante admin_create_raffle.
 */
export async function createRaffleAdmin(
  params: CreateRaffleParams
): Promise<{ success: boolean; raffle?: RaffleRow; error?: string }> {
  try {
    let drawDateIso: string;
    try {
      const parsedDate = new Date(params.drawDate);
      drawDateIso = isNaN(parsedDate.getTime()) ? params.drawDate : parsedDate.toISOString();
    } catch {
      drawDateIso = params.drawDate;
    }

    const { data, error } = await supabase.rpc('admin_create_raffle', {
      p_title: params.title.trim(),
      p_slug: params.slug.trim().toLowerCase(),
      p_description: params.description.trim(),
      p_ticket_price: params.ticketPrice,
      p_total_tickets: params.totalTickets,
      p_max_tickets_per_buyer: params.maxTicketsPerBuyer,
      p_draw_date: drawDateIso,
      p_lottery_reference: params.lotteryReference.trim(),
      p_status: params.status,
    });

    if (error) {
      console.error('[raffleService] Error en admin_create_raffle:', error);
      return {
        success: false,
        error: formatRaffleRpcError(error.message, 'admin_create_raffle'),
      };
    }

    const response = data as { success: boolean; raffle?: RaffleRow; error?: string } | null;
    if (response?.success && response.raffle) {
      return { success: true, raffle: response.raffle };
    }

    return {
      success: false,
      error: response?.error
        ? formatRaffleRpcError(response.error, 'admin_create_raffle')
        : 'No fue posible registrar la nueva edición de la rifa.',
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? formatRaffleRpcError(err.message, 'admin_create_raffle')
          : 'Error de red al crear la rifa.',
    };
  }
}
