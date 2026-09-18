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
import { formatCOP, formatTicketNumber, maskDocumentId } from '@/lib/utils';
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
    } catch (err: unknown) {
      console.error('Error al cargar boletos con detalles:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar el inventario de boletos');
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
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        console.error('Error al cargar boletos con detalles:', err);
        setError(err instanceof Error ? err.message : 'Error al cargar el inventario de boletos');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ticketStatus, searchTicket, currentPage, pageSize, selectedRaffleId]);

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
        setActionError(res.error || 'No se pudo bloquear el boleto.');
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error inesperado al bloquear.');
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
        setActionError(res.error || 'No se pudo desbloquear el boleto.');
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Error inesperado al desbloquear.');
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
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-md, 10px)',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}
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
            <div
              className={styles.metricIcon}
              style={{ color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
            >
              <Ticket size={20} />
            </div>
          </div>
          <div className={styles.metricValue} style={{ color: '#34d399' }}>
            {ticketCounts.availableCount}
          </div>
          <span className={styles.metricHint}>Libres para compra pública</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>En Reserva Temporal</span>
            <div
              className={styles.metricIcon}
              style={{ color: '#fbbf24', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}
            >
              <Clock size={20} />
            </div>
          </div>
          <div className={styles.metricValue} style={{ color: '#fbbf24' }}>
            {ticketCounts.reservedCount}
          </div>
          <span className={styles.metricHint}>En checkout o validación</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Vendidos / Pagados</span>
            <div
              className={styles.metricIcon}
              style={{ color: '#60a5fa', backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
            >
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className={styles.metricValue} style={{ color: '#60a5fa' }}>
            {ticketCounts.soldCount}
          </div>
          <span className={styles.metricHint}>Confirmados por administración</span>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Bloqueados</span>
            <div
              className={styles.metricIcon}
              style={{ color: '#cbd5e1', backgroundColor: 'rgba(148, 163, 184, 0.15)' }}
            >
              <Lock size={20} />
            </div>
          </div>
          <div className={styles.metricValue} style={{ color: '#cbd5e1' }}>
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary, #9cb5ab)',
            }}
          >
            <Filter size={16} />
            <span style={{ fontSize: '0.85rem' }}>Estado:</span>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            {viewMode === 'grid' ? 'Matriz General de Boletos' : 'Inventario Detallado de Boletos'}{' '}
            <span
              style={{ fontSize: '0.9rem', color: 'var(--text-muted, #5e7a6f)', fontWeight: 500 }}
            >
              ({totalFilteredCount} boletos encontrados)
            </span>
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #5e7a6f)' }}>
            Haz clic sobre cualquier boleto para consultar detalles, comprador, orden o bloquear.
          </span>
        </div>

        {isLoading ? (
          <AdminLoadingState message="Cargando inventario de boletos desde Supabase..." />
        ) : error ? (
          <AdminErrorState
            title="Error al cargar boletos"
            message={error}
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
            <div className={styles.paginationBar} style={{ marginTop: '1.5rem' }}>
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
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id || t.number}>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 700,
                          fontSize: '1.05rem',
                          color: '#f59e0b',
                        }}
                      >
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
                            <span
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontWeight: 700,
                                color: '#f59e0b',
                                fontSize: '0.85rem',
                              }}
                            >
                              {t.orders.reference}
                            </span>
                            <div
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                            >
                              Total: {formatCOP(t.orders.total_amount)} ({t.orders.status})
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #5e7a6f)', fontSize: '0.8rem' }}>
                            Sin orden
                          </span>
                        )}
                      </td>
                      <td>
                        {t.buyers ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #f3f7f5)' }}>
                              {t.buyers.full_name}
                            </div>
                            <div
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                            >
                              Doc: {maskDocumentId(t.buyers.document_id)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #5e7a6f)', fontSize: '0.8rem' }}>
                            -
                          </span>
                        )}
                      </td>
                      <td>
                        {t.buyers ? (
                          <div
                            style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9cb5ab)' }}
                          >
                            <div>{t.buyers.phone}</div>
                            <div
                              style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                            >
                              {t.buyers.email}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #5e7a6f)', fontSize: '0.8rem' }}>
                            -
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted, #5e7a6f)' }}>
                        {t.reserved_at ? new Date(t.reserved_at).toLocaleString('es-CO') : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '0.4rem',
                          }}
                        >
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleSelectTicket(t)}
                            title="Consultar detalles"
                          >
                            <Eye size={13} />
                            <span>Detalle</span>
                          </button>
                          {t.status === 'blocked' ? (
                            <button
                              type="button"
                              className={styles.btnSuccess}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
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
                              className={styles.btnSecondary}
                              style={{
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.75rem',
                                opacity: 0.4,
                                cursor: 'not-allowed',
                              }}
                              title="No se puede bloquear un boleto vendido con orden pagada"
                            >
                              <ShieldCheck size={13} />
                              <span>Protegido</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
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
          <div className={styles.adminModalCard} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.15))',
                paddingBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-md, 10px)',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f59e0b',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {formatTicketNumber(selectedTicket.number)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f3f7f5' }}>
                    Boleto #{formatTicketNumber(selectedTicket.number)}
                  </h3>
                  <div style={{ marginTop: '0.2rem' }}>
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
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #5e7a6f)',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mensaje de error / éxito si existe */}
            {actionError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  borderRadius: 'var(--radius-md, 10px)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                }}
              >
                {actionError}
              </div>
            )}

            {/* SECCIÓN: ORDEN ASOCIADA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--color-brand-accent, #f59e0b)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Orden de Compra
              </span>
              {selectedTicket.orders ? (
                <div
                  style={{
                    backgroundColor: 'var(--bg-main, #0a1410)',
                    border: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.2))',
                    borderRadius: 'var(--radius-md, 10px)',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 700,
                        color: '#f59e0b',
                        fontSize: '1rem',
                      }}
                    >
                      {selectedTicket.orders.reference}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary, #9cb5ab)',
                        marginTop: '0.2rem',
                      }}
                    >
                      Estado: <strong>{selectedTicket.orders.status}</strong> • Total:{' '}
                      <strong>{formatCOP(selectedTicket.orders.total_amount)}</strong> • Boletos en
                      orden: {selectedTicket.orders.ticket_count}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={handleOpenAssociatedOrder}
                  >
                    <ShoppingBag size={14} />
                    <span>Revisar Orden Completa</span>
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.85rem',
                    backgroundColor: 'var(--bg-main, #0a1410)',
                    borderRadius: 'var(--radius-md, 10px)',
                    color: 'var(--text-muted, #5e7a6f)',
                    fontSize: '0.85rem',
                  }}
                >
                  Este boleto no está asociado a ninguna orden actualmente.
                </div>
              )}
            </div>

            {/* SECCIÓN: DATOS DEL COMPRADOR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--color-brand-accent, #f59e0b)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
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
                    <span className={styles.ticketDetailValue} style={{ wordBreak: 'break-all' }}>
                      {selectedTicket.buyers.email}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.85rem',
                    backgroundColor: 'var(--bg-main, #0a1410)',
                    borderRadius: 'var(--radius-md, 10px)',
                    color: 'var(--text-muted, #5e7a6f)',
                    fontSize: '0.85rem',
                  }}
                >
                  Sin comprador asignado.
                </div>
              )}
            </div>

            {/* SECCIÓN: ACCIONES ADMINISTRATIVAS */}
            <div
              style={{
                borderTop: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.15))',
                paddingTop: '1rem',
                marginTop: '0.5rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary, #9cb5ab)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: '0.75rem',
                }}
              >
                Acciones Administrativas
              </span>

              {selectedTicket.status === 'sold' ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 'var(--radius-md, 10px)',
                    color: '#93c5fd',
                    fontSize: '0.85rem',
                  }}
                >
                  <ShieldCheck size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Boleto Vendido y Protegido:</strong> Este número se encuentra vinculado
                    a una orden pagada y confirmada. No se permite modificación ni bloqueo manual
                    para proteger la transparencia y legalidad del sorteo.
                  </div>
                </div>
              ) : selectedTicket.status === 'blocked' ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
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
            className={styles.adminModalCard}
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171' }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  Bloquear Boleto #{formatTicketNumber(selectedTicket.number)}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                  Acción administrativa con registro en bitácora de auditoría
                </span>
              </div>
            </div>

            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary, #9cb5ab)',
                margin: '0.5rem 0 0 0',
                lineHeight: 1.5,
              }}
            >
              Al bloquear el boleto <strong>#{formatTicketNumber(selectedTicket.number)}</strong>,
              este dejará de estar disponible para compra pública y cualquier reserva temporal
              asociada será cancelada.
            </p>

            {actionError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  borderRadius: 'var(--radius-md, 10px)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                }}
              >
                {actionError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <label
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #9cb5ab)',
                }}
              >
                Motivo del Bloqueo <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                className={styles.filterSelect}
                style={{ width: '100%' }}
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
                  className={styles.formModalTextarea}
                  placeholder="Detalla el motivo específico del bloqueo para el registro de auditoría..."
                  value={customBlockReason}
                  onChange={(e) => setCustomBlockReason(e.target.value)}
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                borderTop: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.15))',
                paddingTop: '1rem',
                marginTop: '0.5rem',
              }}
            >
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
            className={styles.adminModalCard}
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Unlock size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  Desbloquear Boleto #{formatTicketNumber(selectedTicket.number)}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#6ee7b7' }}>
                  Habilitación para venta en plataforma pública
                </span>
              </div>
            </div>

            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary, #9cb5ab)',
                margin: '0.5rem 0 0 0',
                lineHeight: 1.5,
              }}
            >
              ¿Deseas desbloquear el boleto{' '}
              <strong>#{formatTicketNumber(selectedTicket.number)}</strong>? Este volverá a estar en
              estado <strong>disponible</strong> para que cualquier comprador pueda seleccionarlo y
              reservarlo.
            </p>

            {actionError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  borderRadius: 'var(--radius-md, 10px)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                }}
              >
                {actionError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                marginTop: '0.5rem',
              }}
            >
              <label
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #9cb5ab)',
                }}
              >
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

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                borderTop: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.15))',
                paddingTop: '1rem',
                marginTop: '0.5rem',
              }}
            >
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
