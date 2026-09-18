import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  fetchAdminDashboardMetrics,
  fetchAdminOrdersPaginated,
  fetchAuditLogs,
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
  Send,
  Trophy,
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
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-main, #0a1410)',
            borderRadius: 'var(--radius-md, 10px)',
            color: 'var(--text-muted, #5e7a6f)',
            fontSize: '0.8rem',
          }}
        >
          <Clock size={16} style={{ display: 'block', margin: '0 auto 0.25rem auto' }} />
          Generando acceso seguro...
        </div>
      ) : !signedUrl ? (
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-main, #0a1410)',
            borderRadius: 'var(--radius-md, 10px)',
            color: '#ef4444',
            fontSize: '0.8rem',
          }}
        >
          <AlertTriangle size={16} style={{ display: 'block', margin: '0 auto 0.25rem auto' }} />
          Comprobante no disponible
        </div>
      ) : isPdf ? (
        <div
          className={styles.receiptImageThumbWrapper}
          onClick={() => onReview(order)}
          title="Clic para revisar comprobante PDF"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '140px',
          }}
        >
          <FileText size={32} color="#f59e0b" />
          <span
            style={{ fontSize: '0.75rem', color: '#9cb5ab', marginTop: '0.25rem', fontWeight: 600 }}
          >
            Documento PDF
          </span>
          <div className={styles.receiptOverlayZoom}>
            <Eye size={22} />
          </div>
        </div>
      ) : (
        <div
          className={styles.receiptImageThumbWrapper}
          onClick={() => onReview(order)}
          title="Clic para revisar comprobante"
          style={{ height: '140px' }}
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
          className={styles.btnPrimary}
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '0.45rem 0.75rem',
            fontSize: '0.8rem',
          }}
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
  const [auditLogs, setAuditLogs] = useState<
    {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      performed_by: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }[]
  >([]);

  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'orders' | 'receipts' | 'audit'>('orders');
  const [selectedOrderForReview, setSelectedOrderForReview] = useState<OrderWithDetails | null>(
    null
  );
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [m, recentOrdersRes, recentReceiptsRes, logs] = await Promise.all([
        fetchAdminDashboardMetrics(selectedRaffleId),
        fetchAdminOrdersPaginated({ pageSize: 6, raffleId: selectedRaffleId }),
        fetchAdminOrdersPaginated({ pageSize: 6, hasReceipt: true, raffleId: selectedRaffleId }),
        fetchAuditLogs('ALL', '', selectedRaffleId),
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
      setAuditLogs(logs.slice(0, 8));
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                <div
                  className={styles.metricIcon}
                  style={{ color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
                >
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className={styles.metricValue} style={{ color: '#34d399' }}>
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
                <div
                  className={styles.metricIcon}
                  style={{ color: '#fbbf24', backgroundColor: 'rgba(245, 158, 11, 0.15)' }}
                >
                  <Clock size={20} />
                </div>
              </div>
              <div
                className={styles.metricValue}
                style={{ color: metrics.pendingVerificationMoney > 0 ? '#fbbf24' : 'inherit' }}
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
                <span
                  style={{ fontSize: '1rem', color: 'var(--text-muted, #5e7a6f)', fontWeight: 500 }}
                >
                  / {metrics.totalTickets}
                </span>
              </div>
              <div className={styles.dashboardProgressTrack}>
                <div
                  className={styles.dashboardProgressBar}
                  style={{ width: `${Math.min(metrics.percentageSold, 100)}%` }}
                />
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
                  className={styles.metricIcon}
                  style={{
                    color: metrics.pendingReceiptsCount > 0 ? '#fbbf24' : '#34d399',
                    backgroundColor:
                      metrics.pendingReceiptsCount > 0
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)',
                  }}
                >
                  <Receipt size={20} />
                </div>
              </div>
              <div className={styles.metricValue}>{metrics.pendingReceiptsCount}</div>
              <span className={styles.metricHint}>
                {metrics.pendingReceiptsCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleViewReceipts}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#fbbf24',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: 'inherit',
                    }}
                  >
                    Ver comprobantes pendientes
                  </button>
                ) : (
                  'Bandeja de verificación al día'
                )}
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.75rem',
                  marginTop: '0.2rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
                    {metrics.ticketsAvailable}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted, #5e7a6f)',
                      marginLeft: '0.25rem',
                    }}
                  >
                    disp.
                  </span>
                </div>
                <span style={{ color: 'var(--border-subtle, rgba(156, 181, 171, 0.3))' }}>•</span>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>
                    {metrics.ticketsReserved}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted, #5e7a6f)',
                      marginLeft: '0.25rem',
                    }}
                  >
                    res.
                  </span>
                </div>
                {Boolean(metrics.ticketsBlocked && metrics.ticketsBlocked > 0) && (
                  <>
                    <span style={{ color: 'var(--border-subtle, rgba(156, 181, 171, 0.3))' }}>
                      •
                    </span>
                    <div>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
                        {metrics.ticketsBlocked}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted, #5e7a6f)',
                          marginLeft: '0.25rem',
                        }}
                      >
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.75rem',
                  marginTop: '0.2rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
                    {metrics.paidOrdersCount}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted, #5e7a6f)',
                      marginLeft: '0.25rem',
                    }}
                  >
                    aprob.
                  </span>
                </div>
                <span style={{ color: 'var(--border-subtle, rgba(156, 181, 171, 0.3))' }}>•</span>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
                    {metrics.rejectedOrdersCount}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted, #5e7a6f)',
                      marginLeft: '0.25rem',
                    }}
                  >
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

          {/* Sección Dinámica con Pestañas: Órdenes, Comprobantes, Actividad */}
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
                    className={styles.dashboardTabBadge}
                    style={{ backgroundColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}
                  >
                    {metrics.pendingReceiptsCount} por validar
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`${styles.dashboardTabBtn} ${activeTab === 'audit' ? styles.dashboardTabBtnActive : ''}`}
                onClick={() => setActiveTab('audit')}
              >
                <ShieldCheck size={16} />
                <span>Actividad Administrativa</span>
                <span className={styles.dashboardTabBadge}>{auditLogs.length}</span>
              </button>
            </div>

            {/* CONTENIDO TAB 1: ÚLTIMAS ÓRDENES */}
            {activeTab === 'orders' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
                    Visualizando las 6 órdenes más recientes registradas en Supabase.
                  </span>
                  <Link
                    to="/admin/ordenes"
                    className={styles.btnSecondary}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
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
                          <th style={{ textAlign: 'right' }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((ord) => (
                          <tr key={ord.id}>
                            <td
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontWeight: 700,
                                color: '#f59e0b',
                              }}
                            >
                              {ord.reference}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted, #5e7a6f)' }}>
                              {formatActivityDate(ord.created_at)}
                            </td>
                            <td>
                              <div
                                style={{ fontWeight: 600, color: 'var(--text-primary, #f3f7f5)' }}
                              >
                                {ord.buyers?.full_name || 'N/A'}
                              </div>
                              <div
                                style={{ fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)' }}
                              >
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
                                  <span
                                    style={{
                                      fontSize: '0.75rem',
                                      color: 'var(--text-muted, #5e7a6f)',
                                    }}
                                  >
                                    +{(ord.tickets?.length || 0) - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 700, color: '#f3f7f5' }}>
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
                                <span className={styles.badgeDanger} style={{ opacity: 0.7 }}>
                                  Cancelada
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className={styles.btnSecondary}
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.775rem' }}
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
                    Comprobantes de pago cargados por los usuarios para revisión manual.
                  </span>
                  <Link
                    to="/admin/comprobantes"
                    className={styles.btnSecondary}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
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

            {/* CONTENIDO TAB 3: ACTIVIDAD ADMINISTRATIVA */}
            {activeTab === 'audit' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
                    Registro inmutable de auditoría sobre aprobaciones, rechazos y cambios
                    operativos.
                  </span>
                  <Link
                    to="/admin/auditoria"
                    className={styles.btnSecondary}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    <span>Ver historial de auditoría</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>

                {auditLogs.length === 0 ? (
                  <AdminEmptyState
                    icon={<ShieldCheck size={32} />}
                    title="Sin registros de auditoría"
                    description="Las acciones de los administradores se registrarán de manera inmutable y se mostrarán aquí."
                  />
                ) : (
                  <div className={styles.activityTimeline}>
                    {auditLogs.map((log) => {
                      const isWinner = log.action.toLowerCase().includes('winner');
                      const isApprove =
                        log.action.toLowerCase().includes('approve') ||
                        log.action.toLowerCase().includes('aprobar');
                      const isReject =
                        log.action.toLowerCase().includes('reject') ||
                        log.action.toLowerCase().includes('rechazar');
                      const isNotify =
                        log.action.toLowerCase().includes('notif') ||
                        log.action.toLowerCase().includes('email') ||
                        log.action.toLowerCase().includes('whatsapp');

                      let iconClass = styles.activityIconGeneric;
                      let icon = <Activity size={16} />;
                      let actionTitle = log.action.replace(/_/g, ' ');

                      if (isWinner) {
                        iconClass = styles.activityIconApprove;
                        icon = <Trophy size={16} />;
                        actionTitle = 'Sorteo Oficial: Ganador Registrado';
                      } else if (isApprove) {
                        iconClass = styles.activityIconApprove;
                        icon = <CheckCircle2 size={16} />;
                        actionTitle = 'Pago Aprobado y Boletos Vendidos';
                      } else if (isReject) {
                        iconClass = styles.activityIconReject;
                        icon = <XCircle size={16} />;
                        actionTitle = 'Pago Rechazado';
                      } else if (isNotify) {
                        iconClass = styles.activityIconNotify;
                        icon = <Send size={16} />;
                        actionTitle = 'Notificación Despachada';
                      }

                      return (
                        <div key={log.id} className={styles.activityItem}>
                          <div className={`${styles.activityIcon} ${iconClass}`}>{icon}</div>
                          <div className={styles.activityBody}>
                            <div className={styles.activityActionTitle}>{actionTitle}</div>
                            <div className={styles.activityActionDetails}>
                              {isWinner && log.details ? (
                                <span>
                                  {log.details.ticket_number
                                    ? `Boleto Ganador #${formatTicketNumber(String(log.details.ticket_number))} • `
                                    : ''}
                                  {log.details.buyer_name
                                    ? `Ganador: ${String(log.details.buyer_name)} • `
                                    : ''}
                                  {log.details.order_reference
                                    ? `Orden: ${String(log.details.order_reference)}`
                                    : ''}
                                </span>
                              ) : log.details ? (
                                <span>
                                  {log.details.reference
                                    ? `Orden: ${String(log.details.reference)} • `
                                    : ''}
                                  {log.details.reason
                                    ? `Motivo: ${String(log.details.reason)} • `
                                    : ''}
                                  {log.details.amount
                                    ? `Total: ${formatCOP(Number(log.details.amount))} • `
                                    : ''}
                                  {log.details.tickets_count
                                    ? `${String(log.details.tickets_count)} boletos`
                                    : ''}
                                </span>
                              ) : (
                                <span>
                                  Entidad: {log.entity_type} ({log.entity_id})
                                </span>
                              )}
                            </div>
                            <div className={styles.activityMeta}>
                              <span>{formatActivityDate(log.created_at)}</span>
                              {log.performed_by && (
                                <>
                                  <span>•</span>
                                  <span>Admin: {log.performed_by}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
