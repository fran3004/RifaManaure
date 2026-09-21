import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  fetchAdminDashboardMetrics,
  fetchAdminOrdersPaginated,
  getSignedProofUrl,
  type AdminDashboardMetrics,
  type OrderWithDetails,
} from '@/services/paymentService';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  TrendingUp,
  Ticket,
  Receipt,
  Users,
  Activity,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Eye,
  ShieldCheck,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminOrderReviewModal } from '@/components/admin/orders/AdminOrderReviewModal';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import styles from './AdminViews.module.css';

interface DashboardReceiptCardProps {
  order: OrderWithDetails;
  onReview: (order: OrderWithDetails) => void;
}

const DashboardReceiptThumbnail: React.FC<DashboardReceiptCardProps> = ({ order, onReview }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const receiptPath = order.receipt_url || '';
  const isPdf =
    receiptPath.toLowerCase().endsWith('.pdf') || receiptPath.toLowerCase().includes('.pdf?');

  useEffect(() => {
    let active = true;
    const fetchUrl = async () => {
      if (!receiptPath) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await getSignedProofUrl(receiptPath, 900);
      if (active) {
        if (res.url) {
          setSignedUrl(res.url);
        }
        setLoading(false);
      }
    };
    void fetchUrl();
    return () => {
      active = false;
    };
  }, [receiptPath]);

  return (
    <div className={styles.receiptCard}>
      <div className={styles.receiptCardHeader}>
        <span className={styles.receiptRef}>{order.reference}</span>
        {order.status === 'pending_verification' && (
          <span className={styles.badgeWarning}>
            <Clock size={12} /> Por Validar
          </span>
        )}
        {(order.status === 'paid' || order.status === 'completed') && (
          <span className={styles.badgeSuccess}>
            <CheckCircle2 size={12} /> Aprobado
          </span>
        )}
        {order.status === 'rejected' && (
          <span className={styles.badgeDanger}>
            <XCircle size={12} /> Rechazado
          </span>
        )}
        {order.status === 'pending' && (
          <span className={styles.badgeInfo}>
            <Clock size={12} /> Reserva
          </span>
        )}
      </div>

      <div className={styles.receiptBuyerInfo}>
        <span className={styles.receiptBuyerName}>
          {order.buyers?.full_name || 'Comprador Desconocido'}
        </span>
        <span className={styles.receiptBuyerMeta}>
          {order.ticket_count} boletos • {formatCOP(order.total_amount)}
        </span>
      </div>

      {loading ? (
        <div className={styles.receiptSkeletonBox}>
          <Clock size={16} className={styles.receiptSkeletonIcon} />
          Generando acceso seguro...
        </div>
      ) : !signedUrl ? (
        <div className={`${styles.receiptSkeletonBox} ${styles.receiptSkeletonBoxError}`}>
          <AlertTriangle size={16} className={styles.receiptSkeletonIcon} />
          Comprobante no disponible
        </div>
      ) : isPdf ? (
        <div
          className={`${styles.receiptImageThumbWrapper} ${styles.receiptPdfThumb}`}
          onClick={() => onReview(order)}
          title="Clic para revisar comprobante PDF"
        >
          <FileText size={32} color="var(--brand-accent)" />
          <span className={styles.receiptPdfLabel}>
            Documento PDF
          </span>
          <div className={styles.receiptOverlayZoom}>
            <Eye size={22} />
          </div>
        </div>
      ) : (
        <div
          className={`${styles.receiptImageThumbWrapper} ${styles.receiptThumbFixed}`}
          onClick={() => onReview(order)}
          title="Clic para revisar comprobante"
        >
          <img
            src={signedUrl}
            alt={`Comprobante ${order.reference}`}
            className={styles.receiptImageThumb}
          />
          <div className={styles.receiptOverlayZoom}>
            <Eye size={22} />
          </div>
        </div>
      )}

      <div className={styles.receiptActions}>
        <button
          type="button"
          className={`${styles.btnPrimary} ${styles.receiptFullWidthBtn}`}
          onClick={() => onReview(order)}
        >
          <Eye size={14} />
          <span>Revisar Comprobante</span>
        </button>
      </div>
    </div>
  );
};

export const DashboardView: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>({
    totalTickets: 1000,
    ticketsAvailable: 1000,
    ticketsReserved: 0,
    ticketsSold: 0,
    percentageSold: 0,
    pendingOrdersCount: 0,
    pendingReceiptsCount: 0,
    paidOrdersCount: 0,
    rejectedOrdersCount: 0,
    confirmedMoney: 0,
    pendingVerificationMoney: 0,
    totalBuyersCount: 0,
    totalCollected: 0,
  });

  const [recentOrders, setRecentOrders] = useState<OrderWithDetails[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<OrderWithDetails[]>([]);

  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'orders' | 'receipts'>('orders');
  const [selectedOrderForReview, setSelectedOrderForReview] = useState<OrderWithDetails | null>(
    null
  );
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [m, recentOrdersRes, recentReceiptsRes] = await Promise.all([
        fetchAdminDashboardMetrics(selectedRaffleId),
        fetchAdminOrdersPaginated({ pageSize: 6, raffleId: selectedRaffleId }),
        fetchAdminOrdersPaginated({ pageSize: 6, hasReceipt: true, raffleId: selectedRaffleId }),
      ]);

      setMetrics(m);
      setRecentOrders(recentOrdersRes.orders);

      // Si hay órdenes con comprobantes, ordenar para priorizar pending_verification
      const sortedReceipts = [...recentReceiptsRes.orders].sort((a, b) => {
        if (a.status === 'pending_verification' && b.status !== 'pending_verification') return -1;
        if (b.status === 'pending_verification' && a.status !== 'pending_verification') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setRecentReceipts(sortedReceipts);
      setError(null);
    } catch (err: unknown) {
      console.error('Error al cargar datos del Dashboard:', err);
      const errMsg =
        err instanceof Error ? err.message : 'Error inesperado de red al consultar métricas.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRaffleId]);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let isMounted = true;
    void loadData();

    const ordersChannel = supabase
      .channel('dashboard_orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        if (isMounted) {
          void loadData();
        }
      })
      .subscribe();

    const ticketsChannel = supabase
      .channel('dashboard_tickets_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        if (isMounted) {
          void loadData();
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ordersChannel);
      void supabase.removeChannel(ticketsChannel);
    };
  }, [loadData]);

  const handleOpenReview = (order: OrderWithDetails) => {
    setSelectedOrderForReview(order);
    setIsReviewModalOpen(true);
  };

  const handleCloseReview = () => {
    setIsReviewModalOpen(false);
    setSelectedOrderForReview(null);
  };

  const handleViewReceipts = () => {
    // 1. Buscar si hay comprobante pendiente de verificación en los datos cargados en memoria
    const pendingOrder =
      recentReceipts.find((o) => o.status === 'pending_verification') ||
      recentOrders.find((o) => o.status === 'pending_verification');

    // 2. Activar la pestaña de comprobantes
    setActiveTab('receipts');

    // 3. Desplazar suavemente la pantalla hacia la sección de comprobantes
    const tabsSection = document.getElementById('dashboard-tabs-section');
    if (tabsSection) {
      tabsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 4. Si hay una orden pendiente específica, abrir de inmediato su modal de revisión
    if (pendingOrder) {
      handleOpenReview(pendingOrder);
    } else if (!tabsSection && recentReceipts.length === 0) {
      navigate('/admin/comprobantes');
    }
  };

  const handleOrderUpdated = async () => {
    await loadData();
  };

  const formatActivityDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('es-CO', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const progressTrackStyle: React.CSSProperties = {
    ['--dash-progress-width' as string]: `${Math.min(metrics.percentageSold, 100)}%`,
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Dashboard General"
        description={
          selectedRaffle
            ? `Métricas operativas y financieras para: ${selectedRaffle.title}`
            : 'Métricas operativas y financieras en tiempo real verificadas contra Supabase.'
        }
        badge={selectedRaffle ? `Rifa: ${selectedRaffle.status.toUpperCase()}` : 'En Vivo'}
        actions={
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>Actualizar Métricas</span>
          </button>
        }
      />

      {/* Estado de Carga, Error o Contenido Principal */}
      {isLoading ? (
        <AdminLoadingState message="Calculando métricas en vivo desde Supabase..." />
      ) : error ? (
        <AdminErrorState
          title="Error al cargar métricas del Dashboard"
          message={error}
          onRetry={handleRefresh}
        />
      ) : (
        <>
          {/* Alerta de Comprobantes Pendientes */}
          {metrics.pendingReceiptsCount > 0 && (
            <div className={styles.dashboardAlertBanner}>
              <div className={styles.dashboardAlertBannerContent}>
                <div className={styles.dashboardAlertIconWrapper}>
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className={styles.dashboardAlertTitle}>
                    {metrics.pendingReceiptsCount === 1
                      ? 'Hay 1 comprobante pendiente de verificación'
                      : `Hay ${metrics.pendingReceiptsCount} comprobantes pendientes de verificación`}
                  </h3>
                  <p className={styles.dashboardAlertText}>
                    Monto en espera de validación bancaria:{' '}
                    <strong>{formatCOP(metrics.pendingVerificationMoney)}</strong>. Revisa los
                    comprobantes para aprobar o rechazar y notificar a los compradores.
                  </p>
                </div>
              </div>
              <div className={styles.dashboardAlertActions}>
                <button type="button" className={styles.btnPrimary} onClick={handleViewReceipts}>
                  <Eye size={16} />
                  <span>Ver Comprobantes</span>
                </button>
                <Link to="/admin/comprobantes" className={styles.btnSecondary}>
                  <span>Ir a Bandeja</span>
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          )}
          <div className={styles.metricsGrid}>
            {/* 1. Recaudo Confirmado */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Recaudo Confirmado</span>
                <div className={`${styles.metricIcon} ${styles.metricIconSuccess}`}>
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className={`${styles.metricValue} ${styles.metricValueSuccess}`}>
                {formatCOP(metrics.confirmedMoney)}
              </div>
              <span className={styles.metricHint}>
                Exclusivo de órdenes pagadas ({metrics.paidOrdersCount} órdenes)
              </span>
            </div>

            {/* 2. Dinero Pendiente de Verificación */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Por Verificar</span>
                <div className={`${styles.metricIcon} ${styles.metricIconWarning}`}>
                  <Clock size={20} />
                </div>
              </div>
              <div
                className={`${styles.metricValue} ${metrics.pendingVerificationMoney > 0 ? styles.metricValueWarning : ''}`}
              >
                {formatCOP(metrics.pendingVerificationMoney)}
              </div>
              <span className={styles.metricHint}>
                {metrics.pendingReceiptsCount} comprobante(s) en espera de revisión
              </span>
            </div>

            {/* 3. Boletos Vendidos */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Boletos Vendidos</span>
                <div className={styles.metricIcon}>
                  <Ticket size={20} />
                </div>
              </div>
              <div className={styles.metricValue}>
                {metrics.ticketsSold}{' '}
                <span className={styles.metricTicketTotal}>
                  / {metrics.totalTickets}
                </span>
              </div>
              <div
                className={styles.dashboardProgressTrack}
                style={progressTrackStyle}
              >
                <div className={styles.dashboardProgressBar} />
              </div>
              <span className={styles.metricHint}>
                {metrics.percentageSold}% vendido • {metrics.ticketsAvailable} disponibles
              </span>
            </div>

            {/* 4. Comprobantes Pendientes */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Comprobantes Pendientes</span>
                <div
                  className={`${styles.metricIcon} ${
                    metrics.pendingReceiptsCount > 0
                      ? styles.metricIconWarning
                      : styles.metricIconSuccess
                  }`}
                >
                  <Receipt size={20} />
                </div>
              </div>
              <div className={styles.metricValue}>{metrics.pendingReceiptsCount}</div>
              <span className={styles.metricHint}>
                {metrics.pendingReceiptsCount > 0
                  ? `${metrics.pendingReceiptsCount} pendiente${metrics.pendingReceiptsCount === 1 ? '' : 's'} por verificar`
                  : 'Bandeja de verificación al día'}
              </span>
            </div>

            {/* 5. Estado de Boletos (Disponibles vs Reservados) */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Estado de Boletos</span>
                <div className={styles.metricIcon}>
                  <Layers size={20} />
                </div>
              </div>
              <div className={styles.metricStatRow}>
                <div>
                  <span className={styles.metricStatValueSuccess}>
                    {metrics.ticketsAvailable}
                  </span>
                  <span className={styles.metricStatLabel}>
                    disp.
                  </span>
                </div>
                <span className={styles.metricStatSeparator}>•</span>
                <div>
                  <span className={styles.metricStatValueWarning}>
                    {metrics.ticketsReserved}
                  </span>
                  <span className={styles.metricStatLabel}>
                    res.
                  </span>
                </div>
                {Boolean(metrics.ticketsBlocked && metrics.ticketsBlocked > 0) && (
                  <>
                    <span className={styles.metricStatSeparator}>
                      •
                    </span>
                    <div>
                      <span className={styles.metricStatValueError}>
                        {metrics.ticketsBlocked}
                      </span>
                      <span className={styles.metricStatLabel}>
                        bloq.
                      </span>
                    </div>
                  </>
                )}
              </div>
              <span className={styles.metricHint}>
                {metrics.pendingOrdersCount} orden(es) en proceso de reserva
              </span>
            </div>

            {/* 6. Balanza de Pagos */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Balanza de Pagos</span>
                <div className={styles.metricIcon}>
                  <ShieldCheck size={20} />
                </div>
              </div>
              <div className={styles.metricStatRow}>
                <div>
                  <span className={styles.metricStatValueSuccess}>
                    {metrics.paidOrdersCount}
                  </span>
                  <span className={styles.metricStatLabel}>
                    aprob.
                  </span>
                </div>
                <span className={styles.metricStatSeparator}>•</span>
                <div>
                  <span className={styles.metricStatValueError}>
                    {metrics.rejectedOrdersCount}
                  </span>
                  <span className={styles.metricStatLabel}>
                    rech.
                  </span>
                </div>
              </div>
              <span className={styles.metricHint}>Histórico de auditoría manual</span>
            </div>

            {/* 7. Compradores Registrados */}
            <div className={styles.metricCard}>
              <div className={styles.metricHeader}>
                <span className={styles.metricLabel}>Compradores Registrados</span>
                <div className={styles.metricIcon}>
                  <Users size={20} />
                </div>
              </div>
              <div className={styles.metricValue}>{metrics.totalBuyersCount}</div>
              <span className={styles.metricHint}>Cédulas únicas registradas en el sistema</span>
            </div>
          </div>

          {/* Sección Dinámica con Pestañas: Órdenes y Comprobantes */}
          <div id="dashboard-tabs-section" className={styles.cardSection}>
            <div className={styles.dashboardTabsRow}>
              <button
                type="button"
                className={`${styles.dashboardTabBtn} ${activeTab === 'orders' ? styles.dashboardTabBtnActive : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                <Activity size={16} />
                <span>Últimas Órdenes</span>
                <span className={styles.dashboardTabBadge}>{recentOrders.length}</span>
              </button>

              <button
                type="button"
                className={`${styles.dashboardTabBtn} ${activeTab === 'receipts' ? styles.dashboardTabBtnActive : ''}`}
                onClick={() => setActiveTab('receipts')}
              >
                <Receipt size={16} />
                <span>Últimos Comprobantes</span>
                {metrics.pendingReceiptsCount > 0 && (
                  <span
                    className={`${styles.dashboardTabBadge} ${styles.tabBadgePending}`}
                  >
                    {metrics.pendingReceiptsCount} por validar
                  </span>
                )}
              </button>
            </div>

            {/* CONTENIDO TAB 1: ÚLTIMAS ÓRDENES */}
            {activeTab === 'orders' && (
              <div>
                <div className={styles.tabPanelHeader}>
                  <span className={styles.tabPanelSubtitle}>
                    Visualizando las 6 órdenes más recientes registradas en Supabase.
                  </span>
                  <Link
                    to="/admin/ordenes"
                    className={`${styles.btnSecondary} ${styles.btnCompactSecondary}`}
                  >
                    <span>Ver todas las órdenes</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                {recentOrders.length === 0 ? (
                  <AdminEmptyState
                    icon={<Activity size={32} />}
                    title="Sin órdenes registradas"
                    description="A medida que los clientes compren números, se listarán automáticamente aquí."
                  />
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Referencia</th>
                          <th>Fecha</th>
                          <th>Comprador</th>
                          <th>Boletos</th>
                          <th>Total</th>
                          <th>Estado</th>
                          <th className={styles.thAlignRight}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((ord) => (
                          <tr key={ord.id}>
                            <td className={styles.tdReference}>
                              {ord.reference}
                            </td>
                            <td className={styles.tableDate}>
                              {formatActivityDate(ord.created_at)}
                            </td>
                            <td>
                              <div className={styles.buyerName}>
                                {ord.buyers?.full_name || 'N/A'}
                              </div>
                              <div className={styles.tableMeta}>
                                {ord.buyers?.phone || ord.buyers?.email || ''}
                              </div>
                            </td>
                            <td>
                              <div className={styles.ticketNumbersList}>
                                {(ord.tickets || []).slice(0, 3).map((t) => (
                                  <span key={t.id || t.number} className={styles.ticketNumberChip}>
                                    {formatTicketNumber(t.number)}
                                  </span>
                                ))}
                                {(ord.tickets?.length || 0) > 3 && (
                                  <span className={styles.tableMeta}>
                                    +{(ord.tickets?.length || 0) - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={styles.dashboardTableTotal}>
                              {formatCOP(ord.total_amount)}
                            </td>
                            <td>
                              {ord.status === 'pending_verification' && (
                                <span className={styles.badgeWarning}>
                                  <Clock size={12} /> Por Validar
                                </span>
                              )}
                              {(ord.status === 'paid' || ord.status === 'completed') && (
                                <span className={styles.badgeSuccess}>
                                  <CheckCircle2 size={12} /> Pagada
                                </span>
                              )}
                              {ord.status === 'pending' && (
                                <span className={styles.badgeInfo}>
                                  <Clock size={12} /> Reserva
                                </span>
                              )}
                              {ord.status === 'rejected' && (
                                <span className={styles.badgeDanger}>
                                  <XCircle size={12} /> Rechazada
                                </span>
                              )}
                              {ord.status === 'cancelled' && (
                                <span className={`${styles.badgeDanger} ${styles.badgeCancelled}`}>
                                  Cancelada
                                </span>
                              )}
                            </td>
                              <td className={styles.dashboardTableAction}>
                              <button
                                type="button"
                                className={`${styles.btnSecondary} ${styles.btnSmallSecondary}`}
                                onClick={() => handleOpenReview(ord)}
                              >
                                <Eye size={13} />
                                <span>Revisar</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* CONTENIDO TAB 2: ÚLTIMOS COMPROBANTES */}
            {activeTab === 'receipts' && (
              <div>
                <div className={styles.tabPanelHeaderLg}>
                  <span className={styles.tabPanelSubtitle}>
                    Comprobantes de pago cargados por los usuarios para revisión manual.
                  </span>
                  <Link
                    to="/admin/comprobantes"
                    className={`${styles.btnSecondary} ${styles.btnCompactSecondary}`}
                  >
                    <span>Bandeja completa de comprobantes</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                {recentReceipts.length === 0 ? (
                  <AdminEmptyState
                    icon={<Receipt size={32} />}
                    title="Sin comprobantes recientes"
                    description="No hay órdenes con comprobantes adjuntos en este momento."
                  />
                ) : (
                  <div className={styles.receiptGrid}>
                    {recentReceipts.map((ord) => (
                      <DashboardReceiptThumbnail
                        key={ord.id}
                        order={ord}
                        onReview={handleOpenReview}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de Revisión y Verificación Administrativa */}
      {selectedOrderForReview && (
        <AdminOrderReviewModal
          order={selectedOrderForReview}
          isOpen={isReviewModalOpen}
          onClose={handleCloseReview}
          onOrderUpdated={handleOrderUpdated}
        />
      )}
    </div>
  );
};
