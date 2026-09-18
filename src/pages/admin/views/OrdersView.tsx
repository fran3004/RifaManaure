import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  fetchAdminOrdersPaginated,
  approveOrderPayment,
  rejectOrderPayment,
  type OrderWithDetails,
} from '@/services/paymentService';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { formatCOP } from '@/lib/utils';
import {
  ShoppingCart,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Copy,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { AdminOrderReviewModal } from '@/components/admin/orders/AdminOrderReviewModal';
import { AdminConfirmPaymentModal } from '@/components/admin/orders/AdminConfirmPaymentModal';
import styles from './AdminViews.module.css';

function formatPaymentMethod(method?: string | null): string {
  if (!method) return 'Transferencia Manual';
  switch (method.toLowerCase()) {
    case 'transfer_manual':
      return 'Transferencia Manual';
    case 'wompi':
      return 'Wompi';
    case 'bold':
      return 'Bold';
    case 'mercadopago':
      return 'Mercado Pago';
    case 'cash':
      return 'Efectivo';
    default:
      return method;
  }
}

function formatTicketNumber(num: string): string {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num;
  return n.toString().padStart(3, '0');
}

export const OrdersView: React.FC = () => {
  // Estados de datos y paginación
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros, búsqueda y ordenamiento
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'created_at' | 'status' | 'total_amount'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Acciones y Modales
  const [selectedReviewOrder, setSelectedReviewOrder] = useState<OrderWithDetails | null>(null);
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [approvingOrder, setApprovingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(
    'Comprobante no recibido, ilegible o no coincide con los valores recibidos'
  );
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Reiniciar a página 1 si cambia la rifa seleccionada
  const [prevRaffleId, setPrevRaffleId] = useState(selectedRaffleId);
  if (prevRaffleId !== selectedRaffleId) {
    setPrevRaffleId(selectedRaffleId);
    setPage(1);
  }

  // Consulta paginada a Supabase
  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOrdersPaginated({
        statusFilter,
        searchTerm,
        sortBy,
        sortOrder,
        page,
        pageSize,
        raffleId: selectedRaffleId,
      });

      setOrders(res.orders);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages || 1);
    } catch (err: unknown) {
      console.error('Error al cargar órdenes:', err);
      setError(err instanceof Error ? err.message : 'Error al consultar las órdenes de compra');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchTerm, sortBy, sortOrder, page, pageSize, selectedRaffleId]);

  // Carga inicial y reactiva
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchAdminOrdersPaginated({
          statusFilter,
          searchTerm,
          sortBy,
          sortOrder,
          page,
          pageSize,
          raffleId: selectedRaffleId,
        });
        if (isMounted) {
          setOrders(res.orders);
          setTotalCount(res.totalCount);
          setTotalPages(res.totalPages || 1);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error('Error al cargar órdenes:', err);
          setError(err instanceof Error ? err.message : 'Error al consultar las órdenes de compra');
          setIsLoading(false);
        }
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, [statusFilter, searchTerm, sortBy, sortOrder, page, pageSize, selectedRaffleId]);

  // Reiniciar a página 1 al cambiar filtros o búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'created_at_desc') {
      setSortBy('created_at');
      setSortOrder('desc');
    } else if (val === 'created_at_asc') {
      setSortBy('created_at');
      setSortOrder('asc');
    } else if (val === 'status_asc') {
      setSortBy('status');
      setSortOrder('asc');
    } else if (val === 'status_desc') {
      setSortBy('status');
      setSortOrder('desc');
    } else if (val === 'total_desc') {
      setSortBy('total_amount');
      setSortOrder('desc');
    } else if (val === 'total_asc') {
      setSortBy('total_amount');
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setPage(1);
  };

  // Copiar al portapapeles
  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Abrir modal de confirmación de aprobación
  const handleApprove = (order: OrderWithDetails) => {
    setApprovingOrder(order);
  };

  // Confirmar y ejecutar aprobación de pago
  const handleConfirmApprove = async () => {
    if (!approvingOrder) return;

    setProcessingId(approvingOrder.id);
    setActionMessage(null);

    const result = await approveOrderPayment(approvingOrder.id);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: `¡Orden ${approvingOrder.reference} aprobada con éxito! ${approvingOrder.ticket_count} boletos marcados como vendidos.`,
      });
      setApprovingOrder(null);
      await loadOrders();
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'No se pudo aprobar el pago de la orden.',
      });
    }

    setProcessingId(null);
  };

  // Confirmar rechazo de orden y liberar boletos
  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;

    setProcessingId(rejectingOrder.id);
    setActionMessage(null);

    const result = await rejectOrderPayment(rejectingOrder.id, rejectionReason);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: `Orden ${rejectingOrder.reference} rechazada y ${rejectingOrder.ticket_count} boletos liberados al público.`,
      });
      setRejectingOrder(null);
      await loadOrders();
    } else {
      setActionMessage({
        type: 'error',
        text: result.error || 'No se pudo rechazar la orden.',
      });
    }

    setProcessingId(null);
  };

  const fromCount = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toCount = Math.min(page * pageSize, totalCount);

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Gestión de Órdenes"
        description={
          selectedRaffle
            ? `Supervisión y trazabilidad de órdenes para: ${selectedRaffle.title}`
            : 'Supervisión, filtrado y trazabilidad de todos los pedidos de compra en tiempo real desde Supabase.'
        }
        badge={
          selectedRaffle
            ? `${totalCount} órdenes (${selectedRaffle.status})`
            : `${totalCount} órdenes registradas`
        }
        actions={
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void loadOrders()}
            disabled={isLoading}
          >
            <RefreshCw size={16} />
            <span>Refrescar</span>
          </button>
        }
      />

      {actionMessage && (
        <div
          style={{
            padding: '0.9rem 1.25rem',
            borderRadius: 'var(--radius-md, 10px)',
            backgroundColor:
              actionMessage.type === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${actionMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: actionMessage.type === 'success' ? '#34d399' : '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Barra de Búsqueda, Filtros y Ordenamiento */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <Search size={18} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por referencia, nombre, cédula, teléfono, correo..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPage(1);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #5e7a6f)',
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={styles.filterControls}>
          {/* Filtro por Estado */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--text-secondary, #9cb5ab)',
            }}
          >
            <Filter size={16} />
            <span style={{ fontSize: '0.85rem' }}>Estado:</span>
          </div>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={handleStatusChange}
          >
            <option value="ALL">Todos los estados</option>
            <option value="pending">Reserva Temporal (pending)</option>
            <option value="pending_verification">Por Validar (pending_verification)</option>
            <option value="paid">Pagadas / Aprobadas (paid)</option>
            <option value="rejected">Rechazadas (rejected)</option>
            <option value="expired">Expiradas (expired)</option>
            <option value="cancelled">Canceladas (cancelled)</option>
          </select>

          {/* Ordenamiento */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--text-secondary, #9cb5ab)',
            }}
          >
            <ArrowUpDown size={16} />
            <span style={{ fontSize: '0.85rem' }}>Ordenar:</span>
          </div>
          <select
            className={styles.filterSelect}
            value={`${sortBy}_${sortOrder}`}
            onChange={handleSortChange}
          >
            <option value="created_at_desc">Fecha: Más recientes primero</option>
            <option value="created_at_asc">Fecha: Más antiguas primero</option>
            <option value="status_asc">Estado: A - Z</option>
            <option value="status_desc">Estado: Z - A</option>
            <option value="total_desc">Total: Mayor a menor</option>
            <option value="total_asc">Total: Menor a mayor</option>
          </select>
        </div>
      </div>

      {/* Tabla de Órdenes con las 12 columnas especificadas */}
      <div className={styles.cardSection}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            Listado de Órdenes de Compra
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
            Mostrando {fromCount} - {toCount} de {totalCount} órdenes
          </span>
        </div>

        {isLoading ? (
          <AdminLoadingState message="Consultando órdenes en Supabase..." />
        ) : error ? (
          <AdminErrorState
            title="Error al cargar órdenes"
            message={error}
            onRetry={() => void loadOrders()}
          />
        ) : orders.length === 0 ? (
          <AdminEmptyState
            icon={<ShoppingCart size={36} />}
            title="No se encontraron órdenes"
            description="No hay pedidos registrados que coincidan con los criterios de búsqueda o filtros seleccionados."
          />
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Fecha</th>
                    <th>Comprador</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                    <th>Números</th>
                    <th>Total</th>
                    <th>Método de Pago</th>
                    <th>Estado</th>
                    <th>Comprobante</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => {
                    const isProcessing = processingId === ord.id;
                    const dateStr = new Date(ord.created_at).toLocaleString('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                    const isPendingAction =
                      ord.status === 'pending_verification' || ord.status === 'pending';

                    return (
                      <tr key={ord.id}>
                        {/* 1. Referencia */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <strong
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                color: 'var(--color-brand-accent, #f59e0b)',
                                fontSize: '0.9rem',
                              }}
                            >
                              {ord.reference}
                            </strong>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(ord.reference, `ref_${ord.id}`)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted, #5e7a6f)',
                                cursor: 'pointer',
                                padding: '2px',
                              }}
                              title="Copiar referencia"
                            >
                              {copiedKey === `ref_${ord.id}` ? (
                                <Check size={12} color="#10b981" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 2. Fecha */}
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{dateStr}</td>

                        {/* 3. Comprador */}
                        <td>
                          <strong
                            style={{
                              display: 'block',
                              color: 'var(--text-primary, #f3f7f5)',
                              fontSize: '0.85rem',
                            }}
                          >
                            {ord.buyers?.full_name || 'Desconocido'}
                          </strong>
                          <span
                            style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                          >
                            C.C. {ord.buyers?.document_id || 'N/A'}
                          </span>
                        </td>

                        {/* 4. Teléfono */}
                        <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {ord.buyers?.phone ? (
                            <a
                              href={`https://wa.me/57${ord.buyers.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#34d399', textDecoration: 'none' }}
                              title="Contactar por WhatsApp"
                            >
                              {ord.buyers.phone}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </td>

                        {/* 5. Correo */}
                        <td
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary, #9cb5ab)',
                            maxWidth: '160px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={ord.buyers?.email || 'N/A'}
                        >
                          {ord.buyers?.email || 'N/A'}
                        </td>

                        {/* 6. Cantidad de tickets */}
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--bg-surface-elevated, #1a332a)',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                            }}
                          >
                            {ord.ticket_count}
                          </span>
                        </td>

                        {/* 7. Números */}
                        <td>
                          <div className={styles.ticketNumbersList}>
                            {(ord.tickets || []).map((t) => (
                              <span key={t.id || t.number} className={styles.ticketNumberChip}>
                                {formatTicketNumber(t.number)}
                              </span>
                            ))}
                            {(!ord.tickets || ord.tickets.length === 0) && (
                              <span
                                style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                              >
                                N/A
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 8. Total */}
                        <td
                          style={{
                            fontWeight: 800,
                            color: 'var(--text-primary, #f3f7f5)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatCOP(ord.total_amount)}
                        </td>

                        {/* 9. Método de pago */}
                        <td
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary, #9cb5ab)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatPaymentMethod(ord.payment_method)}
                        </td>

                        {/* 10. Estado */}
                        <td>
                          {ord.status === 'pending_verification' && (
                            <span className={styles.badgeWarning}>
                              <Clock size={12} /> Por Validar
                            </span>
                          )}
                          {ord.status === 'pending' && (
                            <span className={styles.badgeInfo}>
                              <Clock size={12} /> Reserva 10m
                            </span>
                          )}
                          {(ord.status === 'paid' || ord.status === 'completed') && (
                            <span className={styles.badgeSuccess}>
                              <CheckCircle2 size={12} /> Pagada
                            </span>
                          )}
                          {ord.status === 'rejected' && (
                            <span className={styles.badgeDanger}>
                              <XCircle size={12} /> Rechazada
                            </span>
                          )}
                          {ord.status === 'expired' && (
                            <span className={styles.badgeDanger} style={{ opacity: 0.7 }}>
                              <AlertCircle size={12} /> Expirada
                            </span>
                          )}
                          {ord.status === 'cancelled' && (
                            <span className={styles.badgeNeutral} style={{ opacity: 0.7 }}>
                              <X size={12} /> Cancelada
                            </span>
                          )}
                        </td>

                        {/* 11. Comprobante */}
                        <td>
                          {ord.receipt_url ? (
                            <button
                              type="button"
                              onClick={() => setSelectedReviewOrder(ord)}
                              className={styles.btnSecondary}
                              style={{
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.75rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                cursor: 'pointer',
                              }}
                              title="Revisar soporte en modal de auditoría"
                            >
                              <Eye size={14} />
                              <span>Ver</span>
                            </button>
                          ) : (
                            <span
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                            >
                              Sin soporte
                            </span>
                          )}
                        </td>

                        {/* 12. Acciones */}
                        <td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              gap: '0.4rem',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => setSelectedReviewOrder(ord)}
                              title="Abrir auditoría completa de la orden"
                            >
                              <Eye size={14} />
                              <span>Revisar</span>
                            </button>

                            {isPendingAction && (
                              <>
                                <button
                                  type="button"
                                  className={styles.btnSuccess}
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                  onClick={() => void handleApprove(ord)}
                                  disabled={isProcessing}
                                  title="Aprobar pago y confirmar boletos vendidos"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Aprobar</span>
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                  onClick={() => setRejectingOrder(ord)}
                                  disabled={isProcessing}
                                  title="Rechazar orden y liberar boletos"
                                >
                                  <XCircle size={14} />
                                  <span>Rechazar</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación */}
            <div className={styles.paginationBar}>
              <div className={styles.paginationInfo}>
                Mostrando <strong>{fromCount}</strong> a <strong>{toCount}</strong> de{' '}
                <strong>{totalCount}</strong> órdenes
              </div>

              <div className={styles.paginationControls}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginRight: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9cb5ab)' }}>
                    Filas:
                  </span>
                  <select
                    className={styles.pageSizeSelect}
                    value={pageSize}
                    onChange={handlePageSizeChange}
                  >
                    <option value={10}>10 por pág.</option>
                    <option value={20}>20 por pág.</option>
                    <option value={50}>50 por pág.</option>
                  </select>
                </div>

                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || isLoading}
                  title="Primera página"
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1 || isLoading}
                  title="Página anterior"
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>

                <span className={styles.paginationPageBadge}>
                  Pág. {page} de {totalPages}
                </span>

                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={page >= totalPages || isLoading}
                  title="Página siguiente"
                >
                  <span>Siguiente</span>
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  className={styles.paginationBtn}
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || isLoading}
                  title="Última página"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal para Motivo de Rechazo */}
      {rejectingOrder && (
        <div className={styles.adminModalBackdrop} onClick={() => setRejectingOrder(null)}>
          <div className={styles.adminModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3
                style={{
                  margin: 0,
                  color: '#fca5a5',
                  fontSize: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <XCircle size={22} />
                Rechazar Orden {rejectingOrder.reference}
              </h3>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setRejectingOrder(null)}
                style={{ padding: '0.35rem 0.5rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary, #9cb5ab)', fontSize: '0.9rem', margin: 0 }}>
              Al rechazar esta orden, los{' '}
              <strong style={{ color: '#f59e0b' }}>{rejectingOrder.ticket_count} boletos</strong>{' '}
              reservados serán liberados inmediatamente a la plataforma pública.
            </p>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#e2f0ea',
                  marginBottom: '0.5rem',
                }}
              >
                Motivo del Rechazo:
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-main, #0a1410)',
                  border: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.2))',
                  borderRadius: 'var(--radius-md, 10px)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setRejectingOrder(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => void handleConfirmReject()}
                disabled={Boolean(processingId)}
              >
                <XCircle size={16} />
                <span>Confirmar Rechazo y Liberar Boletos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Principal de Revisión y Auditoría Administrativa */}
      <AdminOrderReviewModal
        order={selectedReviewOrder}
        isOpen={Boolean(selectedReviewOrder)}
        onClose={() => setSelectedReviewOrder(null)}
        onOrderUpdated={loadOrders}
      />

      {/* Modal de Confirmación de Aprobación de Pago */}
      <AdminConfirmPaymentModal
        isOpen={Boolean(approvingOrder)}
        order={approvingOrder}
        isProcessing={Boolean(processingId)}
        onConfirm={handleConfirmApprove}
        onClose={() => setApprovingOrder(null)}
      />
    </div>
  );
};
