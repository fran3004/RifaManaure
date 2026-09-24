import { supabase } from '@/lib/supabase';
import type {
  PaymentAccountRow,
  OrderRow,
  BuyerRow,
  TicketRow,
  AuditLogRow,
  PaymentStatus,
  TicketStatus,
  PaymentMethod,
} from '@/types/raffle.types';
import type { Database } from '@/database.types';

export interface SubmitReceiptResult {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

export interface AdminActionPaymentResult {
  success: boolean;
  message?: string;
  ticketsCount?: number;
  error?: string;
}

export interface OrderWithDetails extends OrderRow {
  buyers?: Pick<BuyerRow, 'id' | 'full_name' | 'document_id' | 'phone' | 'email' | 'city'> | null;
  tickets?: Array<Pick<TicketRow, 'id' | 'number' | 'status'>>;
}

export type PaymentAccountInsert = Database['public']['Tables']['payment_accounts']['Insert'];
export type PaymentAccountUpdate = Database['public']['Tables']['payment_accounts']['Update'];

/**
 * Obtiene la lista de cuentas oficiales de pago activas para el checkout público.
 * Estrictamente retorna cuentas reales activas de la base de datos (NUNCA datos inventados).
 */
export async function getPaymentAccounts(): Promise<PaymentAccountRow[]> {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !data) {
      if (error) {
        console.warn('Aviso al cargar cuentas de pago activas:', error.message);
      }
      return [];
    }

    return data as PaymentAccountRow[];
  } catch (err) {
    console.warn('Error al cargar cuentas de pago:', err);
    return [];
  }
}

/**
 * Obtiene todas las cuentas de pago (activas e inactivas) para el panel de administración.
 */
export async function getAllPaymentAccountsAdmin(): Promise<PaymentAccountRow[]> {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error al obtener cuentas para admin:', error.message);
      return [];
    }

    return (data || []) as PaymentAccountRow[];
  } catch (err) {
    console.error('Error al consultar cuentas para admin:', err);
    return [];
  }
}

/**
 * Crea una nueva cuenta oficial de pago en la base de datos.
 */
export async function createPaymentAccount(
  account: PaymentAccountInsert
): Promise<{ success: boolean; data?: PaymentAccountRow; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .insert({
        bank_name: account.bank_name.trim(),
        account_type: account.account_type || 'savings',
        account_number: account.account_number.trim(),
        account_holder: account.account_holder.trim(),
        holder_document_id: account.holder_document_id?.trim() || null,
        instructions: account.instructions?.trim() || null,
        qr_code_url: account.qr_code_url || null,
        is_active: account.is_active ?? true,
        display_order: account.display_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PaymentAccountRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al crear la cuenta',
    };
  }
}

/**
 * Actualiza los datos de una cuenta oficial existente.
 */
export async function updatePaymentAccount(
  id: string,
  updates: PaymentAccountUpdate
): Promise<{ success: boolean; data?: PaymentAccountRow; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('payment_accounts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as PaymentAccountRow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al actualizar la cuenta',
    };
  }
}

/**
 * Activa o desactiva una cuenta de pago en tiempo real.
 */
export async function togglePaymentAccountActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('payment_accounts')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al cambiar estado de la cuenta',
    };
  }
}

/**
 * Elimina una cuenta oficial de pago.
 */
export async function deletePaymentAccount(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('payment_accounts').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al eliminar la cuenta',
    };
  }
}

export const MAX_PROOF_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PROOF_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
export const ALLOWED_PROOF_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

export interface SubmitProofResult {
  success: boolean;
  orderId?: string;
  proofId?: string;
  status?: string;
  error?: string;
  code?: string;
  idempotencyReplayed?: boolean;
  isReplacement?: boolean;
}

/**
 * Valida tipo de archivo, extensión y tamaño máximo (5 MB).
 */
export function validateProofFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Por favor selecciona un archivo de comprobante.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_PROOF_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Formato .${ext} no permitido. Solo se admiten archivos JPG, PNG, WEBP o PDF.`,
    };
  }

  if (file.type && !ALLOWED_PROOF_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error:
        'Tipo de archivo no válido. Solo se admiten imágenes (JPG, PNG, WEBP) o documentos PDF.',
    };
  }

  if (file.size > MAX_PROOF_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `El archivo seleccionado pesa ${sizeMb} MB. El tamaño máximo permitido es de 5 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Genera una URL firmada TEMPORAL y segura para que el administrador autorizado
 * pueda previsualizar el comprobante privado. NUNCA genera una URL pública permanente.
 */
export async function getSignedProofUrl(
  filePathOrData: string,
  expiresInSeconds = 900 // 15 minutos de vigencia
): Promise<{ url?: string; error?: string }> {
  try {
    if (!filePathOrData) return { error: 'Ruta de comprobante no especificada' };

    // Si ya es un Data URL base64 de contingencia
    if (filePathOrData.startsWith('data:')) {
      return { url: filePathOrData };
    }

    // Si ya tiene token de firma válido
    if (filePathOrData.startsWith('http') && filePathOrData.includes('token=')) {
      return { url: filePathOrData };
    }

    // Limpiar ruta interna
    let cleanPath = filePathOrData;
    if (cleanPath.includes('/payment-proofs/')) {
      cleanPath = cleanPath.split('/payment-proofs/')[1];
    } else if (cleanPath.includes('/receipts/')) {
      cleanPath = cleanPath.split('/receipts/')[1];
    }

    // Intentar generar URL firmada desde el bucket privado 'payment-proofs'
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (!error && data?.signedUrl) {
      return { url: data.signedUrl };
    }

    // Fallback al bucket anterior si la migración de storage aún se está procesando
    const { data: legacyData, error: legacyError } = await supabase.storage
      .from('receipts')
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (!legacyError && legacyData?.signedUrl) {
      return { url: legacyData.signedUrl };
    }

    return { error: error?.message || 'No se pudo generar acceso seguro al comprobante' };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al obtener URL segura',
    };
  }
}

/**
 * Sube el comprobante de pago al bucket PRIVADO 'payment-proofs' y lo asocia
 * de manera transaccional con la rifa, orden, comprador y boletos.
 */
export async function uploadPaymentProof(
  file: File,
  orderId: string,
  raffleId: string,
  _buyerId: string,
  paymentReference?: string,
  idempotencyKey?: string
): Promise<SubmitProofResult> {
  try {
    // 1. Validaciones estrictas de archivo
    const val = validateProofFile(file);
    if (!val.valid) {
      return { success: false, error: val.error, code: 'INVALID_FILE' };
    }

    const clientKey =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : undefined);

    // 2. Preparar ruta interna en bucket privado 'payment-proofs'
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = `proofs/${raffleId}/${orderId}/${cleanFileName}`;

    // 3. Subida al bucket PRIVADO 'payment-proofs'
    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Error al subir el comprobante al almacenamiento: ${uploadError.message}`,
      };
    }

    // 4. Invocar procedimiento backend atómico submit_payment_proof
    const { data: rpcData, error: rpcError } = await supabase.rpc('submit_payment_proof', {
      p_order_id: orderId,
      p_file_path: filePath,
      p_file_name: file.name,
      p_file_size: file.size,
      p_mime_type: file.type || 'image/jpeg',
      p_payment_reference: paymentReference?.trim() || undefined,
      p_client_idempotency_key: clientKey,
    });

    if (rpcError) {
      return {
        success: false,
        error: rpcError.message || 'Error al registrar el comprobante de pago.',
      };
    }

    if (rpcData) {
      const res = rpcData as {
        success: boolean;
        proof_id?: string;
        order_id?: string;
        status?: string;
        error?: string;
        code?: string;
        message?: string;
        idempotency_replayed?: boolean;
        is_replacement?: boolean;
      };
      if (res.success) {
        return {
          success: true,
          orderId: res.order_id || orderId,
          proofId: res.proof_id,
          status: 'pending_verification',
          idempotencyReplayed: res.idempotency_replayed,
          isReplacement: res.is_replacement,
        };
      }
      return {
        success: false,
        error: res.error || 'Error al validar el comprobante de pago.',
        code: res.code,
      };
    }

    return {
      success: false,
      error: 'Respuesta inesperada del servidor al procesar el comprobante.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al enviar comprobante';
    return { success: false, error: msg };
  }
}

/**
 * Función de compatibilidad previa para submitOrderReceipt.
 * Delega en la RPC atómica submit_payment_proof.
 */
export async function submitOrderReceipt(
  orderId: string,
  receiptUrl: string,
  paymentReference?: string,
  idempotencyKey?: string
): Promise<SubmitReceiptResult> {
  try {
    const clientKey =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : undefined);

    const { data, error } = await supabase.rpc('submit_payment_proof', {
      p_order_id: orderId,
      p_file_path: receiptUrl,
      p_file_name: receiptUrl.split('/').pop() || 'comprobante.jpg',
      p_file_size: 1024,
      p_mime_type: 'image/jpeg',
      p_payment_reference: paymentReference?.trim() || undefined,
      p_client_idempotency_key: clientKey,
    });

    if (error) {
      return { success: false, error: error.message || 'Error al registrar comprobante' };
    }

    const res = data as { success: boolean; error?: string };
    if (!res?.success) {
      return { success: false, error: res?.error || 'Error al registrar comprobante' };
    }

    return {
      success: true,
      orderId,
      status: 'pending_verification',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al registrar comprobante';
    return { success: false, error: msg };
  }
}

/**
 * Operación administrativa Backend: APROBAR PAGO
 * Ejecuta la RPC atómica approve_order_payment (valida is_admin(auth.uid())).
 * Marca order.status = 'paid' y tickets.status = 'sold' atómicamente.
 */
export async function approveOrderPayment(
  orderId: string,
  _adminId?: string
): Promise<AdminActionPaymentResult> {
  try {
    const { data, error } = await supabase.rpc('approve_order_payment', {
      p_order_id: orderId,
    });

    if (error) {
      return { success: false, error: error.message || 'Error al aprobar orden' };
    }

    if (data) {
      const res = data as {
        success: boolean;
        tickets_sold_count?: number;
        tickets_sold?: number;
        error?: string;
        message?: string;
      };
      if (res.success) {
        return {
          success: true,
          message: res.message || 'Pago aprobado y boletos marcados como vendidos.',
          ticketsCount: res.tickets_sold_count ?? res.tickets_sold,
        };
      }
      return { success: false, error: res.error || 'Error al aprobar orden' };
    }

    return { success: false, error: 'Respuesta inesperada al aprobar orden' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar la aprobación';
    return { success: false, error: msg };
  }
}

/**
 * Operación administrativa Backend: RECHAZAR PAGO
 * Ejecuta la RPC atómica reject_order_payment (valida is_admin(auth.uid())).
 * Marca order.status = 'rejected' y libera los tickets inmediatamente a 'available'.
 */
export async function rejectOrderPayment(
  orderId: string,
  reason: string,
  _adminId?: string
): Promise<AdminActionPaymentResult> {
  try {
    const { data, error } = await supabase.rpc('reject_order_payment', {
      p_order_id: orderId,
      p_reason: reason.trim(),
    });

    if (error) {
      return { success: false, error: error.message || 'Error al rechazar orden' };
    }

    if (data) {
      const res = data as {
        success: boolean;
        released_tickets_count?: number;
        tickets_released?: number;
        error?: string;
        message?: string;
      };
      if (res.success) {
        return {
          success: true,
          message: res.message || 'Orden rechazada y boletos liberados.',
          ticketsCount: res.released_tickets_count ?? res.tickets_released,
        };
      }
      return { success: false, error: res.error || 'Error al rechazar orden' };
    }

    return { success: false, error: 'Respuesta inesperada al rechazar orden' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar el rechazo';
    return { success: false, error: msg };
  }
}

export interface FetchAdminOrdersParams {
  raffleId?: string | null;
  statusFilter?: PaymentStatus | 'ALL' | string;
  searchTerm?: string;
  sortBy?: 'created_at' | 'status' | 'total_amount';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  hasReceipt?: boolean;
}

export interface FetchAdminOrdersResponse {
  orders: OrderWithDetails[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Consulta las órdenes para el panel administrativo con paginación en Supabase,
 * filtros de estado, búsqueda multicriterio y ordenamiento por fecha, estado y monto.
 * NUNCA carga todas las órdenes simultáneamente.
 */
export async function fetchAdminOrdersPaginated(
  params: FetchAdminOrdersParams = {}
): Promise<FetchAdminOrdersResponse> {
  const {
    raffleId = null,
    statusFilter = 'ALL',
    searchTerm = '',
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    pageSize = 10,
    hasReceipt = false,
  } = params;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase.from('orders').select(
      `
        *,
        buyers:buyer_id (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        tickets:tickets (
          id,
          number,
          status
        )
      `,
      { count: 'exact' }
    );

    // Filtrar por rifa activa si se especifica
    if (raffleId) {
      query = query.eq('raffle_id', raffleId);
    }

    // 1. Filtrar por estado si no es 'ALL'
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'paid') {
        query = query.eq('status', 'paid');
      } else {
        query = query.eq('status', statusFilter as PaymentStatus);
      }
    }

    // Filtrar órdenes que tengan comprobante si hasReceipt es true
    if (hasReceipt) {
      query = query.not('receipt_url', 'is', null);
    }

    // 2. Búsqueda multicriterio (referencia, nombre, documento, teléfono, correo)
    const cleanTerm = searchTerm.trim();
    if (cleanTerm) {
      const { data: matchedBuyers } = await supabase
        .from('buyers')
        .select('id')
        .or(
          `full_name.ilike.%${cleanTerm}%,document_id.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`
        )
        .limit(150);

      const buyerIds = (matchedBuyers || []).map((b) => b.id);

      if (buyerIds.length > 0) {
        query = query.or(`reference.ilike.%${cleanTerm}%,buyer_id.in.(${buyerIds.join(',')})`);
      } else {
        query = query.ilike('reference', `%${cleanTerm}%`);
      }
    }

    // 3. Ordenamiento en PostgreSQL
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // 4. Paginación en servidor
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error al consultar órdenes paginadas:', error.message);
      return {
        orders: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      orders: (data || []) as unknown as OrderWithDetails[],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error('Error de red al consultar órdenes paginadas:', err);
    return {
      orders: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }
}

/**
 * Consulta las órdenes para el panel administrativo con compradores y boletos asociados.
 */
export async function fetchAdminOrders(
  statusFilter: string = 'ALL',
  searchTerm: string = '',
  raffleId?: string | null
): Promise<OrderWithDetails[]> {
  try {
    let query = supabase
      .from('orders')
      .select(
        `
        *,
        buyers:buyer_id (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        tickets:tickets (
          id,
          number,
          status
        )
      `
      )
      .order('created_at', { ascending: false });

    if (raffleId) {
      query = query.eq('raffle_id', raffleId);
    }

    if (statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter as PaymentStatus);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error al consultar órdenes administrativas:', error);
      return [];
    }

    let orders = (data || []) as unknown as OrderWithDetails[];

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      orders = orders.filter((o) => {
        const refMatch = o.reference.toLowerCase().includes(term);
        const nameMatch = o.buyers?.full_name.toLowerCase().includes(term);
        const docMatch = o.buyers?.document_id.toLowerCase().includes(term);
        const phoneMatch = o.buyers?.phone.toLowerCase().includes(term);
        return refMatch || nameMatch || docMatch || phoneMatch;
      });
    }

    return orders;
  } catch (err) {
    console.error('Error de red al consultar órdenes:', err);
    return [];
  }
}

export interface AdminDashboardMetrics {
  totalTickets: number;
  ticketsAvailable: number;
  ticketsReserved: number;
  ticketsSold: number;
  ticketsBlocked?: number;
  percentageSold: number;
  pendingOrdersCount: number;
  pendingReceiptsCount: number;
  paidOrdersCount: number;
  rejectedOrdersCount: number;
  expiredOrdersCount?: number;
  cancelledOrdersCount?: number;
  refundedOrdersCount?: number;
  totalOrdersCount?: number;
  confirmedMoney: number;
  pendingVerificationMoney: number;
  totalBuyersCount: number;
  totalCollected: number; // Alias retrocompatible de confirmedMoney
  ordersByStatus?: Record<string, number>;
}

/**
 * Consulta las métricas globales o por rifa para el Dashboard Administrativo
 * mediante la función RPC get_dashboard_kpis directamente en PostgreSQL.
 * Ejecuta agregaciones nativas (COUNT, SUM, FILTER) en un solo viaje de red.
 */
export async function fetchAdminDashboardMetrics(
  raffleId?: string | null
): Promise<AdminDashboardMetrics> {
  try {
    // 1. Ejecutar RPC nativa en Supabase (O(1) datos transmitidos por red)
    const { data, error } = await supabase.rpc('get_dashboard_kpis', {
      p_raffle_id: raffleId || null,
    });

    if (!error && data) {
      const raw = data as Record<string, unknown>;
      return {
        totalTickets: Number(raw.totalTickets ?? raw.total_tickets ?? 1000),
        ticketsAvailable: Number(raw.ticketsAvailable ?? raw.tickets_available ?? 0),
        ticketsReserved: Number(raw.ticketsReserved ?? raw.tickets_reserved ?? 0),
        ticketsSold: Number(raw.ticketsSold ?? raw.tickets_sold ?? 0),
        ticketsBlocked: Number(raw.ticketsBlocked ?? raw.tickets_blocked ?? 0),
        percentageSold: Number(raw.percentageSold ?? raw.percentage_sold ?? 0),
        pendingOrdersCount: Number(raw.pendingOrdersCount ?? raw.pending_orders_count ?? 0),
        pendingReceiptsCount: Number(raw.pendingReceiptsCount ?? raw.pending_receipts_count ?? 0),
        paidOrdersCount: Number(raw.paidOrdersCount ?? raw.paid_orders_count ?? 0),
        rejectedOrdersCount: Number(raw.rejectedOrdersCount ?? raw.rejected_orders_count ?? 0),
        expiredOrdersCount: Number(raw.expiredOrdersCount ?? raw.expired_orders_count ?? 0),
        cancelledOrdersCount: Number(raw.cancelledOrdersCount ?? raw.cancelled_orders_count ?? 0),
        refundedOrdersCount: Number(raw.refundedOrdersCount ?? raw.refunded_orders_count ?? 0),
        totalOrdersCount: Number(raw.totalOrdersCount ?? raw.total_orders_count ?? 0),
        confirmedMoney: Number(raw.confirmedMoney ?? raw.confirmed_money ?? 0),
        pendingVerificationMoney: Number(
          raw.pendingVerificationMoney ?? raw.pending_verification_money ?? 0
        ),
        totalBuyersCount: Number(raw.totalBuyersCount ?? raw.total_buyers_count ?? 0),
        totalCollected: Number(
          raw.totalCollected ?? raw.total_collected ?? raw.confirmedMoney ?? 0
        ),
        ordersByStatus: (raw.ordersByStatus || raw.orders_by_status || {}) as Record<
          string,
          number
        >,
      };
    }

    if (error) {
      console.warn(
        'Aviso: RPC get_dashboard_kpis no disponible o en espera de migración en Supabase, usando agregación ligera de respaldo:',
        error.message
      );
    }
  } catch (rpcErr) {
    console.warn('Aviso: error al ejecutar RPC get_dashboard_kpis:', rpcErr);
  }

  // 2. Fallback seguro en caso de que la RPC no se haya ejecutado aún en la base de datos
  try {
    let ticketsQuery = supabase.from('tickets').select('status');
    if (raffleId) ticketsQuery = ticketsQuery.eq('raffle_id', raffleId);
    const { data: ticketsData } = await ticketsQuery;

    let ticketsSold = 0;
    let ticketsAvailable = 0;
    let ticketsReserved = 0;
    let ticketsBlocked = 0;

    (ticketsData || []).forEach((t) => {
      if (t.status === 'sold') ticketsSold++;
      else if (t.status === 'available') ticketsAvailable++;
      else if (t.status === 'reserved') ticketsReserved++;
      else if (t.status === 'blocked') ticketsBlocked++;
    });

    const totalTickets = ticketsData && ticketsData.length > 0 ? ticketsData.length : 1000;
    const percentageSold =
      totalTickets > 0 ? Number(((ticketsSold / totalTickets) * 100).toFixed(2)) : 0;

    let ordersQuery = supabase.from('orders').select('status, total_amount');
    if (raffleId) ordersQuery = ordersQuery.eq('raffle_id', raffleId);
    const { data: ordersData } = await ordersQuery;

    let confirmedMoney = 0;
    let pendingVerificationMoney = 0;
    let pendingOrdersCount = 0;
    let pendingReceiptsCount = 0;
    let paidOrdersCount = 0;
    let rejectedOrdersCount = 0;

    (ordersData || []).forEach((ord) => {
      const amount = Number(ord.total_amount || 0);
      const st = ord.status;

      if (st === 'paid') {
        confirmedMoney += amount;
        paidOrdersCount++;
      } else if (st === 'pending_verification') {
        pendingVerificationMoney += amount;
        pendingReceiptsCount++;
      } else if (st === 'pending') {
        pendingOrdersCount++;
      } else if (st === 'rejected') {
        rejectedOrdersCount++;
      }
    });

    const { count: totalBuyersCount } = await supabase
      .from('buyers')
      .select('id', { count: 'exact', head: true });

    return {
      totalTickets,
      ticketsAvailable:
        ticketsAvailable || totalTickets - ticketsSold - ticketsReserved - ticketsBlocked,
      ticketsReserved,
      ticketsSold,
      ticketsBlocked,
      percentageSold,
      pendingOrdersCount,
      pendingReceiptsCount,
      paidOrdersCount,
      rejectedOrdersCount,
      confirmedMoney,
      pendingVerificationMoney,
      totalBuyersCount: totalBuyersCount || 0,
      totalCollected: confirmedMoney,
    };
  } catch (fallbackErr) {
    console.error('Error en cálculo de respaldo de métricas de dashboard:', fallbackErr);
    return {
      totalTickets: 1000,
      ticketsAvailable: 1000,
      ticketsReserved: 0,
      ticketsSold: 0,
      ticketsBlocked: 0,
      percentageSold: 0,
      pendingOrdersCount: 0,
      pendingReceiptsCount: 0,
      paidOrdersCount: 0,
      rejectedOrdersCount: 0,
      confirmedMoney: 0,
      pendingVerificationMoney: 0,
      totalBuyersCount: 0,
      totalCollected: 0,
    };
  }
}

/**
 * Cancela una orden pendiente y libera sus boletos asociados inmediatamente.
 * Exclusivo para administradores autorizados mediante la RPC cancel_order (SEC-03).
 */
export async function cancelOrder(
  orderId: string,
  reason: string = 'Cancelación administrativa de orden'
): Promise<AdminActionPaymentResult> {
  try {
    const { data, error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason: reason,
    });

    if (!error && data) {
      const res = data as { success: boolean; tickets_released?: number; error?: string };
      if (res.success) {
        return {
          success: true,
          message: 'Orden cancelada y boletos liberados.',
          ticketsCount: res.tickets_released,
        };
      }
      return { success: false, error: res.error || 'Error al cancelar la orden.' };
    }

    return {
      success: false,
      error: error?.message || 'No fue posible ejecutar la cancelación de la orden.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cancelar la orden';
    return { success: false, error: msg };
  }
}

export interface AuditLogItem extends Omit<AuditLogRow, 'details'> {
  details: Record<string, unknown> | null;
}

export interface FetchAuditLogsParams {
  actionFilter?: string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
  raffleId?: string | null;
}

export interface FetchAuditLogsResponse {
  logs: AuditLogItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Consulta la bitácora de auditoría con filtrado en PostgreSQL (.ilike/.or) y paginación en servidor (.range).
 */
export async function fetchAuditLogsPaginated(
  params: FetchAuditLogsParams = {}
): Promise<FetchAuditLogsResponse> {
  const {
    actionFilter = 'ALL',
    searchTerm = '',
    page = 1,
    pageSize = 25,
    raffleId = null,
  } = params;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase.from('audit_logs').select('*', { count: 'exact' });

    // Filtrar por rifa activa si aplica
    if (raffleId) {
      const { data: raffleOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('raffle_id', raffleId)
        .limit(100);

      const orderIds = (raffleOrders || []).map((o) => o.id);
      const matchIds = [raffleId, ...orderIds];

      query = query.or(`entity_id.in.(${matchIds.join(',')}),details->>raffle_id.eq.${raffleId}`);
    }

    if (actionFilter && actionFilter !== 'ALL') {
      query = query.ilike('action', `%${actionFilter}%`);
    }

    const cleanTerm = searchTerm.trim();
    if (cleanTerm) {
      query = query.or(
        `action.ilike.%${cleanTerm}%,entity_type.ilike.%${cleanTerm}%,entity_id.ilike.%${cleanTerm}%`
      );
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.warn('Error al consultar audit_logs paginados:', error.message);
      return { logs: [], totalCount: 0, page, pageSize, totalPages: 0 };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      logs: (data || []) as unknown as AuditLogItem[],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.warn('Error de red al consultar auditoría paginada:', err);
    return { logs: [], totalCount: 0, page, pageSize, totalPages: 0 };
  }
}

/**
 * Consulta la bitácora de auditoría administrativa en tiempo real (retrocompatible).
 */
export async function fetchAuditLogs(
  actionFilter: string = 'ALL',
  searchTerm: string = '',
  raffleId?: string | null
): Promise<AuditLogItem[]> {
  const res = await fetchAuditLogsPaginated({
    actionFilter,
    searchTerm,
    page: 1,
    pageSize: 100,
    raffleId,
  });
  return res.logs;
}

export interface AdminTicketWithDetails extends TicketRow {
  buyers?: Pick<BuyerRow, 'id' | 'full_name' | 'document_id' | 'phone' | 'email' | 'city'> | null;
  orders?:
    | (Pick<
        OrderRow,
        | 'id'
        | 'reference'
        | 'status'
        | 'total_amount'
        | 'ticket_count'
        | 'payment_method'
        | 'receipt_url'
        | 'created_at'
      > & {
        status: PaymentStatus;
        payment_method: PaymentMethod;
      })
    | null;
}

export interface FetchAdminTicketsParams {
  raffleId?: string | null;
  statusFilter?: TicketStatus | 'ALL' | string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface FetchAdminTicketsResponse {
  tickets: AdminTicketWithDetails[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminTicketCounts {
  totalCount: number;
  availableCount: number;
  reservedCount: number;
  soldCount: number;
  blockedCount: number;
}

/**
 * Consulta métricas consolidadas de inventario de tickets para tarjetas de resumen.
 */
export async function fetchAdminTicketCounts(raffleId?: string | null): Promise<AdminTicketCounts> {
  try {
    let query = supabase.from('tickets').select('status');

    if (raffleId) {
      query = query.eq('raffle_id', raffleId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return {
        totalCount: 1000,
        availableCount: 0,
        reservedCount: 0,
        soldCount: 0,
        blockedCount: 0,
      };
    }

    let availableCount = 0;
    let reservedCount = 0;
    let soldCount = 0;
    let blockedCount = 0;

    for (const t of data) {
      if (t.status === 'available') availableCount++;
      else if (t.status === 'reserved') reservedCount++;
      else if (t.status === 'sold') soldCount++;
      else if (t.status === 'blocked') blockedCount++;
    }

    return {
      totalCount: data.length,
      availableCount,
      reservedCount,
      soldCount,
      blockedCount,
    };
  } catch (err) {
    console.error('Error al obtener conteos de boletos:', err);
    return { totalCount: 1000, availableCount: 0, reservedCount: 0, soldCount: 0, blockedCount: 0 };
  }
}

/**
 * Consulta boletos para el panel administrativo con paginación real en PostgreSQL/Supabase (.range),
 * filtros por estado ('available' | 'reserved' | 'sold' | 'blocked') y búsqueda multicriterio.
 */
export async function fetchAdminTicketsPaginated(
  params: FetchAdminTicketsParams = {}
): Promise<FetchAdminTicketsResponse> {
  const {
    raffleId = null,
    statusFilter = 'ALL',
    searchTerm = '',
    page = 1,
    pageSize = 50,
  } = params;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase.from('tickets').select(
      `
        id,
        raffle_id,
        number,
        status,
        reserved_at,
        reservation_expires_at,
        buyer_id,
        order_id,
        created_at,
        updated_at,
        buyers (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        orders (
          id,
          reference,
          status,
          total_amount,
          ticket_count,
          payment_method,
          receipt_url,
          created_at
        )
      `,
      { count: 'exact' }
    );

    // Filtrar por rifa activa si se especifica
    if (raffleId) {
      query = query.eq('raffle_id', raffleId);
    }

    // 1. Filtrar por estado si no es 'ALL'
    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter as TicketStatus);
    }

    // 2. Búsqueda por número, o por comprador / orden
    const cleanTerm = searchTerm.trim();
    if (cleanTerm) {
      const [{ data: matchedBuyers }, { data: matchedOrders }] = await Promise.all([
        supabase
          .from('buyers')
          .select('id')
          .or(
            `full_name.ilike.%${cleanTerm}%,document_id.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`
          )
          .limit(150),
        supabase.from('orders').select('id').ilike('reference', `%${cleanTerm}%`).limit(150),
      ]);

      const buyerIds = (matchedBuyers || []).map((b) => b.id);
      const orderIds = (matchedOrders || []).map((o) => o.id);

      const conditions: string[] = [`number.ilike.%${cleanTerm}%`];
      if (buyerIds.length > 0) {
        conditions.push(`buyer_id.in.(${buyerIds.join(',')})`);
      }
      if (orderIds.length > 0) {
        conditions.push(`order_id.in.(${orderIds.join(',')})`);
      }

      query = query.or(conditions.join(','));
    }

    // 3. Ordenamiento en PostgreSQL por número ascendente
    query = query.order('number', { ascending: true });

    // 4. Paginación en servidor con .range(from, to)
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error al consultar boletos paginados:', error.message);
      return {
        tickets: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      tickets: (data || []) as unknown as AdminTicketWithDetails[],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error('Error inesperado al consultar boletos paginados:', err);
    return {
      tickets: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
    };
  }
}

/**
 * Consulta la lista completa de boletos con compradores y órdenes asociadas.
 */
export async function fetchAdminTicketsWithDetails(): Promise<AdminTicketWithDetails[]> {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select(
        `
        id,
        raffle_id,
        number,
        status,
        reserved_at,
        reservation_expires_at,
        buyer_id,
        order_id,
        created_at,
        updated_at,
        buyers (
          id,
          full_name,
          document_id,
          phone,
          email,
          city
        ),
        orders (
          id,
          reference,
          status,
          total_amount,
          ticket_count,
          payment_method,
          receipt_url,
          created_at
        )
      `
      )
      .order('number', { ascending: true });

    if (error) {
      console.warn('Aviso al consultar boletos con detalles:', error.message);
      // Fallback a consulta simple si hay problema con la relación
      const { data: simpleData } = await supabase
        .from('tickets')
        .select('*')
        .order('number', { ascending: true });
      return (simpleData || []) as unknown as AdminTicketWithDetails[];
    }

    return (data || []) as unknown as AdminTicketWithDetails[];
  } catch (err) {
    console.error('Error inesperado al consultar boletos:', err);
    return [];
  }
}

/**
 * Bloquea un boleto administrativamente para impedir su compra pública.
 * Protege estrictamente boletos 'sold' con órdenes pagadas.
 */
export async function adminBlockTicket(
  ticketId: string,
  reason: string
): Promise<AdminActionPaymentResult> {
  try {
    // 1. Invocar RPC backend seguro
    const { data, error } = await supabase.rpc('admin_block_ticket', {
      p_ticket_id: ticketId,
      p_reason: reason.trim(),
    });

    if (!error && data) {
      const res = data as {
        success: boolean;
        message?: string;
        error?: string;
        ticket_number?: string;
      };
      if (res.success) {
        return {
          success: true,
          message: res.message || 'Boleto bloqueado exitosamente.',
        };
      }
      return { success: false, error: res.error || 'Error al bloquear el boleto.' };
    }

    // 2. Fallback transaccional directo seguro
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, number, status, order_id')
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return { success: false, error: 'Boleto no encontrado.' };
    }

    if (ticket.status === 'sold') {
      if (ticket.order_id) {
        const { data: ord } = await supabase
          .from('orders')
          .select('status, reference')
          .eq('id', ticket.order_id)
          .single();

        if (ord && ord.status === 'paid') {
          return {
            success: false,
            error: `Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (${ord.reference}).`,
          };
        }
      } else {
        return {
          success: false,
          error: 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.',
        };
      }
    }

    if (ticket.status === 'blocked') {
      return { success: false, error: 'El boleto ya se encuentra bloqueado.' };
    }

    await supabase
      .from('tickets')
      .update({
        status: 'blocked',
        reserved_at: null,
        reservation_expires_at: null,
        buyer_id: null,
        order_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId);

    // Registro en auditoría
    await supabase.from('audit_logs').insert({
      action: 'TICKET_BLOCKED_BY_ADMIN',
      entity_type: 'ticket',
      entity_id: ticketId,
      details: {
        ticket_number: ticket.number,
        previous_status: ticket.status,
        new_status: 'blocked',
        reason: reason.trim(),
      },
    });

    return { success: true, message: `Boleto ${ticket.number} bloqueado exitosamente.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al bloquear boleto.';
    return { success: false, error: msg };
  }
}

/**
 * Desbloquea un boleto previamente bloqueado para dejarlo 'available'.
 */
export async function adminUnblockTicket(
  ticketId: string,
  reason: string = 'Desbloqueado por administración para habilitar venta'
): Promise<AdminActionPaymentResult> {
  try {
    // 1. Invocar RPC backend seguro
    const { data, error } = await supabase.rpc('admin_unblock_ticket', {
      p_ticket_id: ticketId,
      p_reason: reason.trim(),
    });

    if (!error && data) {
      const res = data as {
        success: boolean;
        message?: string;
        error?: string;
        ticket_number?: string;
      };
      if (res.success) {
        return {
          success: true,
          message: res.message || 'Boleto desbloqueado exitosamente.',
        };
      }
      return { success: false, error: res.error || 'Error al desbloquear el boleto.' };
    }

    // 2. Fallback transaccional directo seguro
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, number, status')
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return { success: false, error: 'Boleto no encontrado.' };
    }

    if (ticket.status !== 'blocked') {
      return {
        success: false,
        error: `El boleto no está bloqueado (estado actual: ${ticket.status}).`,
      };
    }

    await supabase
      .from('tickets')
      .update({
        status: 'available',
        reserved_at: null,
        reservation_expires_at: null,
        buyer_id: null,
        order_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId);

    // Auditoría
    await supabase.from('audit_logs').insert({
      action: 'TICKET_UNBLOCKED_BY_ADMIN',
      entity_type: 'ticket',
      entity_id: ticketId,
      details: {
        ticket_number: ticket.number,
        previous_status: 'blocked',
        new_status: 'available',
        reason: reason.trim(),
      },
    });

    return { success: true, message: `Boleto ${ticket.number} desbloqueado y disponible.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al desbloquear boleto.';
    return { success: false, error: msg };
  }
}

/**
 * Invoca el procedimiento seguro de base de datos para liberar reservas expiradas.
 * Protege estrictamente comprobantes en estado 'pending_verification' y órdenes 'paid'.
 */
export async function triggerReleaseExpiredReservations(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('release_expired_reservations');
    if (!error && typeof data === 'number') {
      return data;
    }
    return 0;
  } catch (err) {
    console.warn('Aviso al ejecutar release_expired_reservations:', err);
    return 0;
  }
}
