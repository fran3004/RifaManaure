import { supabase } from '@/lib/supabase';
import type {
  WinnerWithDetails,
  RegisterWinnerPayload,
  BuyerRow,
  OrderRow,
} from '@/types/raffle.types';

export interface TicketWinnerCandidate {
  ticketId: string;
  ticketNumber: string;
  status: string;
  orderId: string;
  orderReference: string;
  orderStatus: string;
  totalAmount: number;
  buyerId: string;
  buyerName: string;
  buyerDocument: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerCity: string;
  purchasedAt: string;
}

export interface RegisterWinnerResult {
  success: boolean;
  error?: string;
  winnerId?: string;
  ticketNumber?: string;
  buyerName?: string;
  message?: string;
}

/**
 * Obtener todos los ganadores registrados con datos de la rifa, comprador y orden.
 */
export async function getWinners(raffleId?: string | null): Promise<WinnerWithDetails[]> {
  try {
    let query = supabase
      .from('winners')
      .select(
        `
        *,
        raffle:raffles (
          id,
          title,
          lottery_reference,
          ticket_price
        ),
        buyer:buyers (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        order:orders (
          id,
          reference,
          created_at,
          total_amount
        )
      `
      )
      .order('draw_date', { ascending: false });

    if (raffleId) {
      query = query.eq('raffle_id', raffleId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error al obtener lista de ganadores:', error);
      return [];
    }

    return (data as unknown as WinnerWithDetails[]) || [];
  } catch (err) {
    console.error('Excepción al cargar ganadores:', err);
    return [];
  }
}

/**
 * Obtener el ganador oficial de una rifa específica si ya fue registrado.
 */
export async function getWinnerForRaffle(raffleId: string): Promise<WinnerWithDetails | null> {
  try {
    const { data, error } = await supabase
      .from('winners')
      .select(
        `
        *,
        raffle:raffles (
          id,
          title,
          lottery_reference,
          ticket_price
        ),
        buyer:buyers (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        order:orders (
          id,
          reference,
          created_at,
          total_amount
        )
      `
      )
      .eq('raffle_id', raffleId)
      .order('draw_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error al consultar ganador de la rifa:', error);
      return null;
    }

    return (data as unknown as WinnerWithDetails) || null;
  } catch (err) {
    console.error('Excepción al consultar ganador de la rifa:', err);
    return null;
  }
}

/**
 * Enmascara el nombre del comprador para proteger su privacidad en la web pública.
 * Ej: "Carlos Mario Rodriguez" -> "Carlos M*** R***"
 */
export function maskBuyerName(fullName?: string | null): string {
  if (!fullName) return 'Comprador Anónimo';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    const word = parts[0];
    return word.length > 3 ? `${word.slice(0, 3)}***` : `${word}***`;
  }
  return parts
    .map((part, index) => {
      if (index === 0) return part; // Primer nombre visible
      return `${part.charAt(0)}***`;
    })
    .join(' ');
}

/**
 * Enmascara la cédula/documento para exhibición pública.
 * Ej: "1065842910" -> "C.C. 1.065.***.***"
 */
export function maskDocumentId(doc?: string | null): string {
  if (!doc) return 'C.C. **********';
  const clean = doc.replace(/\D/g, '');
  if (clean.length < 6) return `C.C. ***${clean.slice(-2)}`;
  const prefix = clean.slice(0, 4);
  return `C.C. ${prefix}******`;
}

/**
 * Enmascara el número de teléfono celular.
 * Ej: "3124567890" -> "312 *** **90"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '3** *** ****';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 7) return '***-****';
  return `${clean.slice(0, 3)} *** **${clean.slice(-2)}`;
}

/**
 * Buscar un boleto vendido para previsualizar al ganador antes de registrar el sorteo.
 */
export async function searchWinningTicketCandidate(
  raffleId: string,
  ticketNumber: string
): Promise<{ success: boolean; candidate?: TicketWinnerCandidate; error?: string }> {
  try {
    const cleanNum = ticketNumber.trim();
    if (!cleanNum) {
      return { success: false, error: 'Ingresa un número de boleto.' };
    }

    const paddedNum = cleanNum.padStart(3, '0');

    const { data, error } = await supabase
      .from('tickets')
      .select(
        `
        id,
        number,
        status,
        order_id,
        buyer_id,
        order:orders (
          id,
          reference,
          status,
          total_amount,
          created_at,
          buyer:buyers (
            id,
            full_name,
            document_id,
            phone,
            email,
            city
          )
        ),
        direct_buyer:buyers (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        )
      `
      )
      .eq('raffle_id', raffleId)
      .or(`number.eq.${cleanNum},number.eq.${paddedNum}`)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return {
        success: false,
        error: `El boleto "${cleanNum}" no existe en la emisión de esta rifa.`,
      };
    }

    if (data.status !== 'sold') {
      let statusDesc = 'disponible para compra';
      if (data.status === 'reserved') statusDesc = 'en proceso de verificación de pago';
      if (data.status === 'blocked') statusDesc = 'bloqueado por administración';

      return {
        success: false,
        error: `El boleto "${data.number}" NO está vendido (Estado: ${statusDesc}). Solo se pueden premiar boletos con pago aprobado.`,
      };
    }

    // Resolver comprador (desde el ticket o la orden)
    type RawBuyer = Pick<
      BuyerRow,
      'id' | 'full_name' | 'document_id' | 'phone' | 'email' | 'city'
    > | null;
    type RawOrder =
      | (Pick<OrderRow, 'id' | 'reference' | 'status' | 'total_amount' | 'created_at'> & {
          buyer: RawBuyer;
        })
      | null;

    const rawOrder = (Array.isArray(data.order) ? data.order[0] : data.order) as RawOrder;
    const directBuyer = (
      Array.isArray(data.direct_buyer) ? data.direct_buyer[0] : data.direct_buyer
    ) as RawBuyer;
    const resolvedBuyer = directBuyer || rawOrder?.buyer;

    if (!resolvedBuyer || !rawOrder) {
      return {
        success: false,
        error: `El boleto "${data.number}" no tiene información de orden o comprador vinculada.`,
      };
    }

    const candidate: TicketWinnerCandidate = {
      ticketId: data.id,
      ticketNumber: data.number,
      status: data.status,
      orderId: rawOrder.id,
      orderReference: rawOrder.reference,
      orderStatus: rawOrder.status,
      totalAmount: rawOrder.total_amount,
      buyerId: resolvedBuyer.id,
      buyerName: resolvedBuyer.full_name,
      buyerDocument: resolvedBuyer.document_id,
      buyerPhone: resolvedBuyer.phone,
      buyerEmail: resolvedBuyer.email,
      buyerCity: resolvedBuyer.city,
      purchasedAt: rawOrder.created_at,
    };

    return { success: true, candidate };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al buscar boleto.',
    };
  }
}

/**
 * Registrar oficialmente el ganador llamando a la RPC register_winner.
 */
export async function registerWinner(
  payload: RegisterWinnerPayload
): Promise<RegisterWinnerResult> {
  try {
    const { data, error } = await supabase.rpc('register_winner', {
      p_raffle_id: payload.raffleId,
      p_ticket_number: payload.ticketNumber.trim(),
      p_lottery_draw_number: payload.lotteryDrawNumber.trim(),
      p_draw_date: payload.drawDate || new Date().toISOString(),
      p_official_act_url: payload.officialActUrl || null,
      p_notes: payload.notes || null,
    });

    if (error) {
      console.error('Error al ejecutar RPC register_winner:', error);
      return {
        success: false,
        error: error.message || 'Error en la base de datos al registrar ganador.',
      };
    }

    const result = data as {
      success?: boolean;
      error?: string;
      winner_id?: string;
      ticket_number?: string;
      buyer_name?: string;
      message?: string;
    };

    if (result && result.success === false) {
      return {
        success: false,
        error: result.error || 'No se pudo completar el registro del ganador.',
      };
    }

    return {
      success: true,
      winnerId: result?.winner_id,
      ticketNumber: result?.ticket_number,
      buyerName: result?.buyer_name,
      message: result?.message || 'Ganador registrado exitosamente.',
    };
  } catch (err) {
    console.error('Excepción al registrar ganador:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al registrar ganador.',
    };
  }
}

/**
 * Subir acta oficial en PDF al bucket 'winner-documents'
 */
export async function uploadWinnerActDocument(
  file: File,
  raffleId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (file.type !== 'application/pdf') {
      return { success: false, error: 'El acta oficial debe ser un archivo en formato PDF.' };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'El archivo PDF no debe exceder 10 MB.' };
    }

    const fileExt = 'pdf';
    const timestamp = Date.now();
    const filePath = `actas/${raffleId}/acta_sorteo_${timestamp}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('winner-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: publicData } = supabase.storage.from('winner-documents').getPublicUrl(filePath);

    return { success: true, url: publicData.publicUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al subir acta PDF.',
    };
  }
}

