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
import { supabase } from '@/lib/supabase';
import { formatCOP } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
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
  Phone,
  Mail,
} from 'lucide-react';
import { AdminOrderReviewModal } from '@/components/admin/orders/AdminOrderReviewModal';
import { AdminConfirmPaymentModal } from '@/components/admin/orders/AdminConfirmPaymentModal';
import styles from './AdminViews.module.css';

export const OrdersView: React.FC = () => {
  // Estados de datos y paginación
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);

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
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al consultar las órdenes de compra');
      logAppError('OrdersView.loadOrders', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
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
          setIsForbidden(false);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const normalized = normalizeAppError(err, 'Error al consultar las órdenes de compra');
          logAppError('OrdersView.init', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
          setIsLoading(false);
        }
      }
    };
    void init();

    const channel = supabase
      .channel('admin_orders_realtime_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          if (isMounted) {
            void loadOrders();
          }
        }
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal admin_orders_realtime_channel:', err?.message || status);
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [statusFilter, searchTerm, sortBy, sortOrder, page, pageSize, selectedRaffleId, loadOrders]);

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

  // Abrir modal de confirmación de aprobación (requiere comprobante y estado de verificación)
  const handleApprove = (order: OrderWithDetails) => {
    if (!order.receipt_url || order.status === 'pending') {
      return;
    }
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
      const normalized = normalizeAppError(
        { message: result.error, code: result.code },
        'No se pudo aprobar el pago de la orden.'
      );
      logAppError('OrdersView.handleConfirmApprove', normalized);
      setActionMessage({
        type: 'error',
        text: normalized.userMessage,
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
      const normalized = normalizeAppError(
        { message: result.error, code: result.code },
        'No se pudo rechazar la orden.'
      );
      logAppError('OrdersView.handleConfirmReject', normalized);
      setActionMessage({
        type: 'error',
        text: normalized.userMessage,
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
            : 'Supervisión, filtrado y trazabilidad de todos los pedidos de compra en tiempo real.'
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
          className={`${styles.actionBanner} ${actionMessage.type === 'success' ? styles.actionBannerSuccess : styles.actionBannerError}`}
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
              className={styles.searchClearBtn}
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={styles.filterControls}>
          {/* Filtro por Estado */}
          <div className={styles.filterLabel}>
            <Filter size={16} />
            <span className={styles.filterLabelText}>Estado:</span>
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
          <div className={styles.filterLabel}>
            <ArrowUpDown size={16} />
            <span className={styles.filterLabelText}>Ordenar:</span>
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
        <div className={styles.sectionHeader}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleNoMargin}`}>
            Listado de Órdenes de Compra
          </h2>
          <span className={styles.sectionCount}>
            Mostrando {fromCount} - {toCount} de {totalCount} órdenes
          </span>
        </div>

        {isLoading ? (
          <AdminLoadingState message="Consultando órdenes..." />
        ) : error ? (
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar órdenes'}
            message={error}
            isForbidden={isForbidden}
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
            <div className={`${styles.tableWrapper} ${styles.ordersTableWrapper}`}>
              <table className={`${styles.table} ${styles.ordersTable}`}>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Fecha</th>
                    <th>Comprador</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Canales</th>
                    <th className={styles.thAlignRight}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => {
                    const isProcessing = processingId === ord.id;
                    const dateStr = new Date(ord.created_at).toLocaleString('es-CO', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                    const hasReceipt = Boolean(ord.receipt_url && ord.receipt_url.trim().length > 0);
                    const isPendingAction =
                      ord.status === 'pending_verification' && hasReceipt;

                    return (
                      <tr key={ord.id}>
                        {/* 1. Referencia */}
                        <td>
                          <div className={styles.referenceCell}>
                            <strong className={styles.orderReference}>
                              {ord.reference}
                            </strong>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(ord.reference, `ref_${ord.id}`)}
                              className={styles.inlineCopyBtn}
                              title="Copiar referencia"
                            >
                              {copiedKey === `ref_${ord.id}` ? (
                                <Check size={12} color="var(--color-success)" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 2. Fecha */}
                        <td className={styles.tdDateNowrap}>{dateStr}</td>

                        {/* 3. Comprador */}
                        <td>
                          <strong className={styles.buyerNameBlock}>
                            {ord.buyers?.full_name || 'Desconocido'}
                          </strong>
                          <span className={styles.tableMeta}>
                            C.C. {ord.buyers?.document_id || 'N/A'}
                          </span>
                        </td>

                        {/* 4. Total */}
                        <td className={styles.dashboardTableTotal}>
                          {formatCOP(ord.total_amount)}
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
                          {ord.status === 'paid' && (
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
                            <span className={`${styles.badgeDanger} ${styles.badgeCancelled}`}>
                              <AlertCircle size={12} /> Expirada
                            </span>
                          )}
                          {ord.status === 'cancelled' && (
                            <span className={`${styles.badgeNeutral} ${styles.badgeCancelled}`}>
                              <X size={12} /> Cancelada
                            </span>
                          )}
                          {!['pending_verification', 'pending', 'paid', 'rejected', 'expired', 'cancelled'].includes(ord.status) && (
                            <span className={styles.badgeNeutral}>
                              {ord.status}
                            </span>
                          )}
                        </td>

                        {/* Canales de Confirmación */}
                        <td>
                          {(!ord.contact_preference || ord.contact_preference === 'both') && (
                            <span
                              className={styles.badgeSuccess}
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', gap: '0.25rem' }}
                              title="Canales: WhatsApp (Manual) + Correo (Automático)"
                            >
                              <Phone size={10} /> + <Mail size={10} /> Ambos
                            </span>
                          )}
                          {ord.contact_preference === 'email' && (
                            <span
                              className={styles.badgeWarning}
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', gap: '0.25rem' }}
                              title="Canal: Solo Correo Automático"
                            >
                              <Mail size={10} /> Correo
                            </span>
                          )}
                          {ord.contact_preference === 'whatsapp' && (
                            <span
                              className={styles.badgeInfo}
                              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', gap: '0.25rem' }}
                              title="Canal: Solo WhatsApp Manual"
                            >
                              <Phone size={10} /> WhatsApp
                            </span>
                          )}
                        </td>

                        {/* 11. Acciones: la revisión contiene el comprobante cuando existe */}
                        <td className={styles.thAlignRight}>
                          <div className={styles.tableActions}>
                            <button
                              type="button"
                              className={`${styles.btnSecondary} ${styles.btnSmallSecondary}`}
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
                                  className={`${styles.btnSuccess} ${styles.btnSmallSecondary}`}
                                  onClick={() => void handleApprove(ord)}
                                  disabled={isProcessing}
                                  title="Aprobar pago y confirmar boletos vendidos"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Aprobar</span>
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.btnDanger} ${styles.btnSmallSecondary}`}
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
                <div className={styles.pageSizeRow}>
                  <span className={styles.pageSizeLabel}>
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
            <div className={styles.modalHeaderBetween}>
              <h3 className={styles.rejectModalTitle}>
                <XCircle size={22} />
                Rechazar Orden {rejectingOrder.reference}
              </h3>
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.modalCloseMiniBtn}`}
                onClick={() => setRejectingOrder(null)}
              >
                <X size={16} />
              </button>
            </div>

            <p className={styles.modalDescriptionText}>
              Al rechazar esta orden, los{' '}
              <strong className={styles.highlightText}>{rejectingOrder.ticket_count} boletos</strong>{' '}
              reservados serán liberados inmediatamente a la plataforma pública.
            </p>

            <div>
              <label className={styles.modalFieldLabel}>
                Motivo del Rechazo:
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className={styles.modalReasonTextarea}
              />
            </div>

            <div className={styles.modalFooterActions}>
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
