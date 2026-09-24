import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  fetchAdminTicketsPaginated,
  fetchAdminTicketCounts,
  adminBlockTicket,
  adminUnblockTicket,
  triggerReleaseExpiredReservations,
  type AdminTicketWithDetails,
  type AdminTicketCounts,
  type OrderWithDetails,
} from '@/services/paymentService';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { supabase } from '@/lib/supabase';
import { formatCOP, formatTicketNumber, maskDocumentId } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  Ticket,
  Search,
  Filter,
  Layers,
  RefreshCw,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Eye,
  AlertTriangle,
  ShoppingBag,
  Grid,
  Table as TableIcon,
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
} from 'lucide-react';
import { AdminOrderReviewModal } from '@/components/admin/orders/AdminOrderReviewModal';
import styles from './AdminViews.module.css';

const BLOCK_REASONS_PRESETS = [
  'Bloqueo preventivo por administración',
  'Número reservado para premiación / cortesía',
  'Apartado especial por promotor autorizado',
  'Incidencia técnica o duplicidad reportada',
  'Otro motivo justificado',
];

const formatOrderStatus = (status: string | undefined): string => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'Pagada';
    case 'approved':
      return 'Aprobada';
    case 'pending':
      return 'Pendiente';
    case 'verifying':
      return 'En Verificación';
    case 'reserved':
      return 'En Reserva';
    case 'rejected':
      return 'Rechazada';
    case 'cancelled':
      return 'Cancelada';
    case 'expired':
      return 'Expirada';
    default:
      return status || 'Desconocido';
  }
};

const getOrderStatusBadgeClass = (status: string | undefined): string => {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'approved':
      return styles.orderStatusPaid;
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return styles.orderStatusRejected;
    default:
      return styles.orderStatusPending;
  }
};

export const TicketsView: React.FC = () => {
  const [tickets, setTickets] = useState<AdminTicketWithDetails[]>([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [ticketCounts, setTicketCounts] = useState<AdminTicketCounts>({
    totalCount: 1000,
    availableCount: 0,
    reservedCount: 0,
    soldCount: 0,
    blockedCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [searchTicket, setSearchTicket] = useState('');
  const [ticketStatus, setTicketStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Paginación en servidor con Supabase .range(from, to)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Estados de Inspección y Modales
  const [selectedTicket, setSelectedTicket] = useState<AdminTicketWithDetails | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Modal de Bloqueo
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS_PRESETS[0]);
  const [customBlockReason, setCustomBlockReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal de Desbloqueo
  const [isUnblockModalOpen, setIsUnblockModalOpen] = useState(false);
  const [unblockReason, setUnblockReason] = useState('Habilitado nuevamente para venta pública');

  // Modal de Orden Completa
  const [selectedOrderForReview, setSelectedOrderForReview] = useState<OrderWithDetails | null>(
    null
  );
  const [isOrderReviewModalOpen, setIsOrderReviewModalOpen] = useState(false);

  // Reiniciar a página 1 si cambia la rifa seleccionada
  const [prevRaffleId, setPrevRaffleId] = useState(selectedRaffleId);
  if (prevRaffleId !== selectedRaffleId) {
    setPrevRaffleId(selectedRaffleId);
    setCurrentPage(1);
  }

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setActionError(null);
    try {
      await triggerReleaseExpiredReservations();
      const [countsData, result] = await Promise.all([
        fetchAdminTicketCounts(selectedRaffleId),
        fetchAdminTicketsPaginated({
          statusFilter: ticketStatus,
          searchTerm: searchTicket,
          page: currentPage,
          pageSize: pageSize,
          raffleId: selectedRaffleId,
        }),
      ]);
      setTicketCounts(countsData);
      setTickets(result.tickets);
      setTotalFilteredCount(result.totalCount);
      setTotalPages(result.totalPages || 1);
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al cargar el inventario de boletos');
      logAppError('TicketsView.loadTickets', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setIsLoading(false);
    }
  }, [ticketStatus, searchTicket, currentPage, pageSize, selectedRaffleId]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      triggerReleaseExpiredReservations().catch(() => 0),
      fetchAdminTicketCounts(selectedRaffleId),
      fetchAdminTicketsPaginated({
        statusFilter: ticketStatus,
        searchTerm: searchTicket,
        page: currentPage,
        pageSize: pageSize,
        raffleId: selectedRaffleId,
      }),
    ])
      .then(([, countsData, result]) => {
        if (!isMounted) return;
        setTicketCounts(countsData);
        setTickets(result.tickets);
        setTotalFilteredCount(result.totalCount);
        setTotalPages(result.totalPages || 1);
        setIsForbidden(false);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const normalized = normalizeAppError(err, 'Error al cargar el inventario de boletos');
        logAppError('TicketsView.init', normalized);
        setError(normalized.userMessage);
        setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
        setIsLoading(false);
      });

    const channel = supabase
      .channel(`admin_tickets_realtime_${selectedRaffleId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          ...(selectedRaffleId ? { filter: `raffle_id=eq.${selectedRaffleId}` } : {}),
        },
        () => {
          if (isMounted) {
            void loadTickets();
          }
        }
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[Realtime] Canal admin_tickets_realtime_${selectedRaffleId || 'all'}:`, err?.message || status);
        }
      });

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [ticketStatus, searchTicket, currentPage, pageSize, selectedRaffleId, loadTickets]);

  // Manejadores de Inspección
  const handleSelectTicket = (t: AdminTicketWithDetails) => {
    setSelectedTicket(t);
    setIsDetailModalOpen(true);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedTicket(null);
    setActionError(null);
  };

  // Abrir Modal de Bloqueo
  const handleOpenBlockModal = (t: AdminTicketWithDetails) => {
    setSelectedTicket(t);
    setBlockReason(BLOCK_REASONS_PRESETS[0]);
    setCustomBlockReason('');
    setActionError(null);
    setIsBlockModalOpen(true);
  };

  const handleConfirmBlock = async () => {
    if (!selectedTicket) return;
    const effectiveReason =
      blockReason === 'Otro motivo justificado' ? customBlockReason.trim() : blockReason;

    if (!effectiveReason) {
      setActionError('Debes indicar un motivo para bloquear el boleto.');
      return;
    }

    setIsProcessingAction(true);
    setActionError(null);
    try {
      const res = await adminBlockTicket(selectedTicket.id, effectiveReason);
      if (res.success) {
        setActionSuccess(res.message || 'Boleto bloqueado exitosamente.');
        setIsBlockModalOpen(false);
        await loadTickets();
        // Actualizar ticket seleccionado si sigue en modal
        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                status: 'blocked',
                buyer_id: null,
                order_id: null,
                buyers: null,
                orders: null,
              }
            : null
        );
      } else {
        const normalized = normalizeAppError(
          { message: res.error },
          'No se pudo bloquear el boleto.'
        );
        logAppError('TicketsView.handleConfirmBlock', normalized);
        setActionError(normalized.userMessage);
      }
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error inesperado al bloquear el boleto.');
      logAppError('TicketsView.handleConfirmBlock.catch', normalized);
      setActionError(normalized.userMessage);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Abrir Modal de Desbloqueo
  const handleOpenUnblockModal = (t: AdminTicketWithDetails) => {
    setSelectedTicket(t);
    setUnblockReason('Habilitado nuevamente para venta pública');
    setActionError(null);
    setIsUnblockModalOpen(true);
  };

  const handleConfirmUnblock = async () => {
    if (!selectedTicket) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      const res = await adminUnblockTicket(selectedTicket.id, unblockReason);
      if (res.success) {
        setActionSuccess(res.message || 'Boleto desbloqueado exitosamente.');
        setIsUnblockModalOpen(false);
        await loadTickets();
        setSelectedTicket((prev) => (prev ? { ...prev, status: 'available' } : null));
      } else {
        const normalized = normalizeAppError(
          { message: res.error },
          'No se pudo desbloquear el boleto.'
        );
        logAppError('TicketsView.handleConfirmUnblock', normalized);
        setActionError(normalized.userMessage);
      }
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error inesperado al desbloquear el boleto.');
      logAppError('TicketsView.handleConfirmUnblock.catch', normalized);
      setActionError(normalized.userMessage);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Abrir Modal de Orden Asociada
  const handleOpenAssociatedOrder = () => {
    if (!selectedTicket?.orders) return;
    const orderData: OrderWithDetails = {
      id: selectedTicket.orders.id,
      raffle_id: selectedTicket.raffle_id,
      buyer_id: selectedTicket.buyer_id || '',
      reference: selectedTicket.orders.reference,
      total_amount: selectedTicket.orders.total_amount,
      ticket_count: selectedTicket.orders.ticket_count,
      status: selectedTicket.orders.status,
      payment_method: selectedTicket.orders.payment_method || 'transfer_manual',
      payment_gateway_id: null,
      payment_gateway_data: null,
      receipt_url: selectedTicket.orders.receipt_url,
      rejection_reason: null,
      contact_preference: 'both',
      verified_at: null,
      verified_by: null,
      created_at: selectedTicket.orders.created_at,
      updated_at: selectedTicket.orders.created_at,
      client_idempotency_key: '',
      idempotency_fingerprint: null,
      buyers: selectedTicket.buyers,
      tickets: [
        { id: selectedTicket.id, number: selectedTicket.number, status: selectedTicket.status },
      ],
    };
    setSelectedOrderForReview(orderData);
    setIsOrderReviewModalOpen(true);
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Control de Tickets"
        description={
          selectedRaffle
            ? `Inventario en vivo, ventas y bloqueos para: ${selectedRaffle.title}`
            : 'Inventario en vivo, consulta de compradores, trazabilidad de órdenes y gestión segura de bloqueos.'
        }
        badge={
          selectedRaffle
            ? `${ticketCounts.totalCount} Boletos (${selectedRaffle.status})`
            : `${ticketCounts.totalCount} Boletos`
        }
        actions={
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void loadTickets()}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>Sincronizar Boletos</span>
          </button>
        }
      />

      {/* Alerta de Éxito Global */}
      {actionSuccess && (
        <div className={styles.successAlert}>
          <div className={styles.successAlertContent}>
            <CheckCircle2 size={18} />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className={styles.iconButtonSuccess}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Grid de Métricas de Inventario */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Emisión</span>
            <div className={styles.metricIcon}>
              <Layers size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{ticketCounts.totalCount}</div>
          <span className={styles.metricHint}>Numeración 000 a 999</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Disponibles</span>
            <div className={`${styles.metricIcon} ${styles.metricIconAvailable}`}>
              <Ticket size={20} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueAvailable}`}>
            {ticketCounts.availableCount}
          </div>
          <span className={styles.metricHint}>Libres para compra pública</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>En Reserva Temporal</span>
            <div className={`${styles.metricIcon} ${styles.metricIconReserved}`}>
              <Clock size={20} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueReserved}`}>
            {ticketCounts.reservedCount}
          </div>
          <span className={styles.metricHint}>En checkout o validación</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Vendidos / Pagados</span>
            <div className={`${styles.metricIcon} ${styles.metricIconSold}`}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueSold}`}>
            {ticketCounts.soldCount}
          </div>
          <span className={styles.metricHint}>Confirmados por administración</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Bloqueados</span>
            <div className={`${styles.metricIcon} ${styles.metricIconBlocked}`}>
              <Lock size={20} />
            </div>
          </div>
          <div className={`${styles.metricValue} ${styles.metricValueBlocked}`}>
            {ticketCounts.blockedCount}
          </div>
          <span className={styles.metricHint}>Retirados de venta</span>
        </div>
      </div>

      {/* Barra de Filtros, Búsqueda y Modos de Vista */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <Search size={18} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por número (ej. 777), comprador, cédula, teléfono u orden..."
            value={searchTicket}
            onChange={(e) => {
              setSearchTicket(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className={styles.filterControls}>
          <div className={styles.filterLabel}>
            <Filter size={16} />
            <span className={styles.filterLabelText}>Estado:</span>
          </div>
          <select
            className={styles.filterSelect}
            value={ticketStatus}
            onChange={(e) => {
              setTicketStatus(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="ALL">Todos los boletos ({ticketCounts.totalCount})</option>
            <option value="available">Disponibles ({ticketCounts.availableCount})</option>
            <option value="reserved">En Reserva ({ticketCounts.reservedCount})</option>
            <option value="sold">Vendidos ({ticketCounts.soldCount})</option>
            <option value="blocked">Bloqueados ({ticketCounts.blockedCount})</option>
          </select>

          {/* Toggle de Modo de Vista */}
          <div className={styles.viewModeToggle}>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewMode === 'grid' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('grid')}
              title="Vista Matriz Visual"
            >
              <Grid size={15} />
              <span>Matriz</span>
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewMode === 'table' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="Vista Tabla Detallada"
            >
              <TableIcon size={15} />
              <span>Tabla</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: MATRIZ O TABLA */}
      <div className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleNoMargin}`}>
            {viewMode === 'grid' ? 'Matriz General de Boletos' : 'Inventario Detallado de Boletos'}{' '}
            <span className={styles.sectionCount}>
              ({totalFilteredCount} boletos encontrados)
            </span>
          </h2>
          <span className={styles.sectionHint}>
            Haz clic sobre cualquier boleto para consultar detalles, comprador, orden o bloquear.
          </span>
        </div>

        {isLoading ? (
          <AdminLoadingState message="Cargando inventario de boletos desde Supabase..." />
        ) : error ? (
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar boletos'}
            message={error}
            isForbidden={isForbidden}
            onRetry={() => void loadTickets()}
          />
        ) : tickets.length === 0 ? (
          <AdminEmptyState
            icon={<Ticket size={32} />}
            title="Sin boletos encontrados"
            description="No se encontraron boletos que coincidan con el filtro o término de búsqueda."
          />
        ) : viewMode === 'grid' ? (
          /* MODO 1: MATRIZ VISUAL INTERACTIVA */
          <div>
            <div className={styles.ticketMatrixGrid}>
              {tickets.map((t) => {
                let itemClass = styles.ticketMatrixItemAvailable;
                let label = 'Libre';

                if (t.status === 'sold') {
                  itemClass = styles.ticketMatrixItemSold;
                  label = 'Vendido';
                } else if (t.status === 'reserved') {
                  itemClass = styles.ticketMatrixItemReserved;
                  label = 'Reserva';
                } else if (t.status === 'blocked') {
                  itemClass = styles.ticketMatrixItemBlocked;
                  label = 'Bloqueado';
                }

                const isSelected = selectedTicket?.id === t.id;

                return (
                  <div
                    key={t.id || t.number}
                    className={`${styles.ticketMatrixItem} ${itemClass} ${isSelected ? styles.ticketMatrixItemActive : ''}`}
                    onClick={() => handleSelectTicket(t)}
                    title={`Boleto #${t.number} | Estado: ${t.status}${t.buyers?.full_name ? ` | Comprador: ${t.buyers.full_name}` : ''}${t.orders?.reference ? ` | Orden: ${t.orders.reference}` : ''}`}
                  >
                    {formatTicketNumber(t.number)}
                    <span className={styles.ticketMatrixSubtext}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Paginación para Vista de Matriz */}
            <div className={`${styles.paginationBar} ${styles.paginationBarMatrix}`}>
              <div className={styles.paginationInfo}>
                Mostrando <strong>{tickets.length}</strong> de <strong>{totalFilteredCount}</strong>{' '}
                boletos
              </div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>
                <span className={styles.paginationPageBadge}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                >
                  <span>Siguiente</span>
                  <ChevronRight size={16} />
                </button>
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={50}>50 por pág.</option>
                  <option value={100}>100 por pág.</option>
                  <option value={200}>200 por pág.</option>
                  <option value={500}>500 por pág.</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* MODO 2: TABLA DETALLADA CON PAGINACIÓN */
          <div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Boleto</th>
                    <th>Estado</th>
                    <th>Orden Asociada</th>
                    <th>Comprador</th>
                    <th>Contacto</th>
                    <th>Fecha Reserva</th>
                    <th className={styles.tableHeaderActions}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id || t.number}>
                      <td className={styles.ticketNumberCell}>
                        {formatTicketNumber(t.number)}
                      </td>
                      <td>
                        {t.status === 'available' && (
                          <span className={styles.badgeSuccess}>
                            <Ticket size={12} /> Disponible
                          </span>
                        )}
                        {t.status === 'reserved' && (
                          <span className={styles.badgeWarning}>
                            <Clock size={12} /> Reservado
                          </span>
                        )}
                        {t.status === 'sold' && (
                          <span className={styles.badgeInfo}>
                            <CheckCircle2 size={12} /> Vendido
                          </span>
                        )}
                        {t.status === 'blocked' && (
                          <span className={styles.badgeBlocked}>
                            <Lock size={12} /> Bloqueado
                          </span>
                        )}
                      </td>
                      <td>
                        {t.orders ? (
                          <div>
                            <span className={styles.orderReference}>
                              {t.orders.reference}
                            </span>
                            <div className={styles.tableMeta}>
                              Total: {formatCOP(t.orders.total_amount)} ({t.orders.status})
                            </div>
                          </div>
                        ) : (
                          <span className={styles.tableMuted}>
                            Sin orden
                          </span>
                        )}
                      </td>
                      <td>
                        {t.buyers ? (
                          <div>
                            <div className={styles.buyerName}>
                              {t.buyers.full_name}
                            </div>
                            <div className={styles.tableMeta}>
                              Doc: {maskDocumentId(t.buyers.document_id)}
                            </div>
                          </div>
                        ) : (
                          <span className={styles.tableMuted}>
                            -
                          </span>
                        )}
                      </td>
                      <td>
                        {t.buyers ? (
                          <div className={styles.contactCell}>
                            <div>{t.buyers.phone}</div>
                            <div className={styles.tableMeta}>
                              {t.buyers.email}
                            </div>
                          </div>
                        ) : (
                          <span className={styles.tableMuted}>
                            -
                          </span>
                        )}
                      </td>
                      <td className={styles.tableDate}>
                        {t.reserved_at ? new Date(t.reserved_at).toLocaleString('es-CO') : '-'}
                      </td>
                      <td className={styles.tableActionsCell}>
                        <div className={styles.tableActions}>
                          <button
                            type="button"
                            className={`${styles.btnSecondary} ${styles.compactActionBtn}`}
                            onClick={() => handleSelectTicket(t)}
                            title="Consultar detalles"
                          >
                            <Eye size={13} />
                            <span>Detalle</span>
                          </button>
                          {t.status === 'blocked' ? (
                            <button
                              type="button"
                              className={`${styles.btnSuccess} ${styles.compactActionBtn}`}
                              onClick={() => handleOpenUnblockModal(t)}
                              title="Desbloquear boleto"
                            >
                              <Unlock size={13} />
                              <span>Desbloquear</span>
                            </button>
                          ) : t.status === 'sold' ? (
                            <button
                              type="button"
                              disabled
                              className={`${styles.btnSecondary} ${styles.compactActionBtn} ${styles.protectedActionBtn}`}
                              title="No se puede bloquear un boleto vendido con orden pagada"
                            >
                              <ShieldCheck size={13} />
                              <span>Protegido</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${styles.btnDanger} ${styles.compactActionBtn}`}
                              onClick={() => handleOpenBlockModal(t)}
                              title="Bloquear boleto preventivamente"
                            >
                              <Lock size={13} />
                              <span>Bloquear</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación de Tabla */}
            <div className={styles.paginationBar}>
              <div className={styles.paginationInfo}>
                Mostrando <strong>{tickets.length}</strong> de <strong>{totalFilteredCount}</strong>{' '}
                boletos filtrados
              </div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>
                <span className={styles.paginationPageBadge}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.paginationBtn}
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                >
                  <span>Siguiente</span>
                  <ChevronRight size={16} />
                </button>
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={25}>25 por pág.</option>
                  <option value={50}>50 por pág.</option>
                  <option value={100}>100 por pág.</option>
                  <option value={200}>200 por pág.</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: DETALLE E INSPECCIÓN DE BOLETO                                   */}
      {/* ========================================================================= */}
      {isDetailModalOpen && selectedTicket && (
        <div className={styles.adminModalBackdrop} onClick={handleCloseDetail}>
          <div className={`${styles.adminModalCard} ${styles.ticketDetailModalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <div className={styles.detailHeaderGroup}>
                <div className={styles.ticketNumberBadge}>
                  {formatTicketNumber(selectedTicket.number)}
                </div>
                <div>
                  <h3 className={styles.detailTitle}>
                    Boleto #{formatTicketNumber(selectedTicket.number)}
                  </h3>
                  <div className={styles.detailStatus}>
                    {selectedTicket.status === 'available' && (
                      <span className={styles.badgeSuccess}>
                        <Ticket size={12} /> Disponible para compra
                      </span>
                    )}
                    {selectedTicket.status === 'reserved' && (
                      <span className={styles.badgeWarning}>
                        <Clock size={12} /> En Reserva Temporal
                      </span>
                    )}
                    {selectedTicket.status === 'sold' && (
                      <span className={styles.badgeInfo}>
                        <CheckCircle2 size={12} /> Vendido y Confirmado
                      </span>
                    )}
                    {selectedTicket.status === 'blocked' && (
                      <span className={styles.badgeBlocked}>
                        <Lock size={12} /> Bloqueado por Administración
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDetail}
                className={styles.iconButtonNeutral}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mensaje de error / éxito si existe */}
            {actionError && (
              <div className={styles.actionError}>
                {actionError}
              </div>
            )}

            {/* SECCIÓN: ORDEN ASOCIADA */}
            <div className={styles.detailSection}>
              <span className={styles.detailSectionLabel}>
                <ShoppingBag size={14} />
                Orden de Compra
              </span>
              {selectedTicket.orders ? (
                <div className={styles.orderCard}>
                  <div>
                    <div className={styles.orderReferenceLarge}>
                      {selectedTicket.orders.reference}
                    </div>
                    <div className={styles.orderMeta}>
                      <span>Estado:</span>
                      <span className={`${styles.orderStatusBadge} ${getOrderStatusBadgeClass(selectedTicket.orders.status)}`}>
                        {formatOrderStatus(selectedTicket.orders.status)}
                      </span>
                      <span className={styles.metaDivider}>•</span>
                      <span>Total:</span>
                      <strong className={styles.metaAmount}>{formatCOP(selectedTicket.orders.total_amount)}</strong>
                      <span className={styles.metaDivider}>•</span>
                      <span>Boletos en orden:</span>
                      <strong className={styles.metaCount}>{selectedTicket.orders.ticket_count}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btnSecondary} ${styles.modalActionBtn}`}
                    onClick={handleOpenAssociatedOrder}
                  >
                    <ShoppingBag size={14} />
                    <span>Revisar Orden Completa</span>
                  </button>
                </div>
              ) : (
                <div className={styles.detailEmpty}>
                  Este boleto no está asociado a ninguna orden actualmente.
                </div>
              )}
            </div>

            {/* SECCIÓN: DATOS DEL COMPRADOR */}
            <div className={styles.detailSection}>
              <span className={styles.detailSectionLabel}>
                <User size={14} />
                Datos del Comprador
              </span>
              {selectedTicket.buyers ? (
                <div className={styles.ticketDetailGrid}>
                  <div className={styles.ticketDetailGroup}>
                    <span className={styles.ticketDetailLabel}>Nombre Completo</span>
                    <span className={styles.ticketDetailValue}>
                      {selectedTicket.buyers.full_name}
                    </span>
                  </div>
                  <div className={styles.ticketDetailGroup}>
                    <span className={styles.ticketDetailLabel}>Documento</span>
                    <span className={styles.ticketDetailValue}>
                      {maskDocumentId(selectedTicket.buyers.document_id)}
                    </span>
                  </div>
                  <div className={styles.ticketDetailGroup}>
                    <span className={styles.ticketDetailLabel}>Teléfono</span>
                    <span className={styles.ticketDetailValue}>{selectedTicket.buyers.phone}</span>
                  </div>
                  <div className={styles.ticketDetailGroup}>
                    <span className={styles.ticketDetailLabel}>Correo Electrónico</span>
                    <span className={`${styles.ticketDetailValue} ${styles.emailValue}`}>
                      {selectedTicket.buyers.email}
                    </span>
                  </div>
                </div>
              ) : (
                <div className={styles.detailEmpty}>
                  Sin comprador asignado.
                </div>
              )}
            </div>

            {/* SECCIÓN: ACCIONES ADMINISTRATIVAS */}
            <div className={styles.detailActions}>
              <span className={styles.detailActionsLabel}>
                <Shield size={14} />
                Acciones Administrativas
              </span>

              {selectedTicket.status === 'sold' ? (
                <div className={styles.protectedNotice}>
                  <ShieldCheck size={20} className={styles.protectedNoticeIcon} />
                  <div>
                    <strong>Boleto Vendido y Protegido:</strong> Este número se encuentra vinculado
                    a una orden pagada y confirmada. No se permite modificación ni bloqueo manual
                    para proteger la transparencia y legalidad del sorteo.
                  </div>
                </div>
              ) : selectedTicket.status === 'blocked' ? (
                <div className={styles.actionRow}>
                  <span className={styles.actionText}>
                    El boleto está bloqueado. Puedes habilitarlo para que vuelva a estar disponible
                    en el checkout.
                  </span>
                  <button
                    type="button"
                    className={styles.btnSuccess}
                    onClick={() => handleOpenUnblockModal(selectedTicket)}
                  >
                    <Unlock size={16} />
                    <span>Desbloquear Boleto</span>
                  </button>
                </div>
              ) : (
                <div className={styles.actionRow}>
                  <span className={styles.actionText}>
                    {selectedTicket.status === 'reserved'
                      ? 'El boleto está en reserva temporal. Al bloquearlo, se cancelará su disponibilidad para compra.'
                      : 'El boleto está libre. Puedes bloquearlo preventivamente para retirarlo del inventario público.'}
                  </span>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={() => handleOpenBlockModal(selectedTicket)}
                  >
                    <Lock size={16} />
                    <span>Bloquear Boleto</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRMACIÓN DE BLOQUEO DE BOLETO                                */}
      {/* ========================================================================= */}
      {isBlockModalOpen && selectedTicket && (
        <div
          className={styles.adminModalBackdrop}
          onClick={() => !isProcessingAction && setIsBlockModalOpen(false)}
        >
          <div
            className={`${styles.adminModalCard} ${styles.narrowModalCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.dangerModalHeader}>
              <div className={styles.dangerModalIcon}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className={styles.modalTitle}>
                  Bloquear Boleto #{formatTicketNumber(selectedTicket.number)}
                </h3>
                <span className={styles.dangerModalSubtitle}>
                  Acción administrativa con registro en bitácora de auditoría
                </span>
              </div>
            </div>

            <p className={styles.modalParagraph}>
              Al bloquear el boleto <strong>#{formatTicketNumber(selectedTicket.number)}</strong>,
              este dejará de estar disponible para compra pública y cualquier reserva temporal
              asociada será cancelada.
            </p>

            {actionError && (
              <div className={styles.actionError}>
                {actionError}
              </div>
            )}

            <div className={styles.formStackBlockReason}>
              <label className={styles.modalFormLabel}>
                Motivo del Bloqueo <span className={styles.requiredMark}>*</span>
              </label>
              <select
                className={`${styles.filterSelect} ${styles.fullWidthSelect}`}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              >
                {BLOCK_REASONS_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>

              {blockReason === 'Otro motivo justificado' && (
                <textarea
                  placeholder="Detalla el motivo específico del bloqueo para el registro de auditoría..."
                  value={customBlockReason}
                  onChange={(e) => setCustomBlockReason(e.target.value)}
                  className={`${styles.formModalTextarea} ${styles.textareaWithTopMargin}`}
                />
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsBlockModalOpen(false)}
                disabled={isProcessingAction}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => void handleConfirmBlock()}
                disabled={isProcessingAction}
              >
                <Lock size={16} />
                <span>{isProcessingAction ? 'Bloqueando...' : 'Confirmar Bloqueo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRMACIÓN DE DESBLOQUEO DE BOLETO                             */}
      {/* ========================================================================= */}
      {isUnblockModalOpen && selectedTicket && (
        <div
          className={styles.adminModalBackdrop}
          onClick={() => !isProcessingAction && setIsUnblockModalOpen(false)}
        >
          <div
            className={`${styles.adminModalCard} ${styles.narrowModalCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.successModalHeader}>
              <div className={styles.successModalIcon}>
                <Unlock size={22} />
              </div>
              <div>
                <h3 className={styles.modalTitle}>
                  Desbloquear Boleto #{formatTicketNumber(selectedTicket.number)}
                </h3>
                <span className={styles.successModalSubtitle}>
                  Habilitación para venta en plataforma pública
                </span>
              </div>
            </div>

            <p className={styles.modalParagraph}>
              ¿Deseas desbloquear el boleto{' '}
              <strong>#{formatTicketNumber(selectedTicket.number)}</strong>? Este volverá a estar en
              estado <strong>disponible</strong> para que cualquier comprador pueda seleccionarlo y
              reservarlo.
            </p>

            {actionError && (
              <div className={styles.actionError}>
                {actionError}
              </div>
            )}

            <div className={styles.formStackUnblockReason}>
              <label className={styles.modalFormLabel}>
                Motivo / Nota de Auditoría
              </label>
              <input
                type="text"
                className={styles.searchInput}
                value={unblockReason}
                onChange={(e) => setUnblockReason(e.target.value)}
                placeholder="Motivo de desbloqueo..."
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsUnblockModalOpen(false)}
                disabled={isProcessingAction}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnSuccess}
                onClick={() => void handleConfirmUnblock()}
                disabled={isProcessingAction}
              >
                <Unlock size={16} />
                <span>{isProcessingAction ? 'Desbloqueando...' : 'Confirmar Desbloqueo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: REVISIÓN DE LA ORDEN ASOCIADA                                    */}
      {/* ========================================================================= */}
      {isOrderReviewModalOpen && selectedOrderForReview && (
        <AdminOrderReviewModal
          order={selectedOrderForReview}
          isOpen={isOrderReviewModalOpen}
          onClose={() => {
            setIsOrderReviewModalOpen(false);
            setSelectedOrderForReview(null);
          }}
          onOrderUpdated={async () => {
            await loadTickets();
          }}
        />
      )}
    </div>
  );
};
