import React, { useState, useEffect, useCallback } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { fetchAdminRaffles, type RaffleWithStats } from '@/services/raffleService';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { AdminEditRaffleModal } from '@/components/admin/raffles/AdminEditRaffleModal';
import { AdminCreateRaffleModal } from '@/components/admin/raffles/AdminCreateRaffleModal';
import { formatCOP } from '@/lib/utils';
import {
  Sparkles,
  Calendar,
  DollarSign,
  Award,
  Plus,
  Edit3,
  RefreshCw,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
  Lock,
  Layers,
  X,
} from 'lucide-react';
import adminStyles from './AdminViews.module.css';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import styles from './RafflesView.module.css';

const formatColombianDate = (isoDate?: string | null): string => {
  if (!isoDate) return 'Por Definir';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoDate || 'Por Definir';
  }
};

export const RafflesView: React.FC = () => {
  const { selectedRaffleId, setSelectedRaffleId, reloadRaffles } = useAdminRaffle();
  const [raffles, setRaffles] = useState<RaffleWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRaffleToEdit, setSelectedRaffleToEdit] = useState<RaffleRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const loadRaffles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAdminRaffles();
      if (res.success) {
        setRaffles(res.raffles);
      } else {
        setError(res.error || 'No fue posible cargar las rifas desde la base de datos.');
      }
    } catch (err: unknown) {
      console.error('Error al cargar rifas:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Error inesperado de red al consultar el catálogo de rifas.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchAdminRaffles();
        if (active) {
          if (res.success) {
            setRaffles(res.raffles);
          } else {
            setError(res.error || 'No fue posible cargar las rifas desde la base de datos.');
          }
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (active) {
          console.error('Error al cargar rifas:', err);
          setError(err instanceof Error ? err.message : 'Error al cargar las rifas.');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleEditSuccess = (updated: RaffleRow) => {
    setFeedback({
      type: 'success',
      message: `Los parámetros de "${updated.title}" fueron actualizados exitosamente en Supabase.`,
    });
    loadRaffles();
    void reloadRaffles();
  };

  const handleCreateSuccess = (newRaffle: RaffleRow) => {
    setFeedback({
      type: 'success',
      message: `La edición "${newRaffle.title}" y su emisión de boletos fueron creadas exitosamente.`,
    });
    setSelectedRaffleId(newRaffle.id);
    loadRaffles();
    void reloadRaffles();
  };

  // Identificar la rifa principal activa (o la primera si no hay activa)
  const activeRaffle =
    raffles.find((r) => r.status === 'active') || (raffles.length > 0 ? raffles[0] : null);
  const otherRaffles = activeRaffle ? raffles.filter((r) => r.id !== activeRaffle.id) : [];

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className={styles.badgeActive}>
            <CheckCircle size={12} /> Activa
          </span>
        );
      case 'paused':
        return (
          <span className={styles.badgePaused}>
            <Clock size={12} /> Pausada
          </span>
        );
      case 'finished':
        return (
          <span className={styles.badgeFinished}>
            <Award size={12} /> Finalizada
          </span>
        );
      case 'closed':
        return (
          <span className={styles.badgeFinished}>
            <Lock size={12} /> Cerrada
          </span>
        );
      default:
        return (
          <span className={styles.badgeDraft}>
            <AlertCircle size={12} /> Borrador
          </span>
        );
    }
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Gestión de Rifas"
        description="Supervisión de sorteos, precio unitario de boletos, fecha del sorteo, lotería de referencia y control de estados."
        badge={
          raffles.length > 0
            ? `${raffles.length} ${raffles.length === 1 ? 'edición' : 'ediciones'}`
            : undefined
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              className={adminStyles.btnSecondary}
              onClick={loadRaffles}
              disabled={isLoading}
              title="Refrescar catálogo"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              className={adminStyles.btnPrimary}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={16} />
              <span>Nueva Rifa</span>
            </button>
          </div>
        }
      />

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`${styles.feedbackToast} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {feedback.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            className={styles.feedbackCloseBtn}
            onClick={() => setFeedback(null)}
            title="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Estado de Carga */}
      {isLoading ? (
        <div className={adminStyles.cardSection}>
          <AdminLoadingState message="Cargando catálogo de rifas desde Supabase..." />
        </div>
      ) : error ? (
        <div className={adminStyles.cardSection}>
          <AdminErrorState
            title="Error al cargar rifas"
            message={error}
            onRetry={() => void loadRaffles()}
          />
        </div>
      ) : !activeRaffle ? (
        <AdminEmptyState
          icon={<Sparkles size={40} />}
          title="No hay rifas registradas"
          description="Aún no se ha creado ninguna edición de sorteo en el sistema. Puedes crear la primera haciendo clic en 'Nueva Rifa'."
        />
      ) : (
        <>
          {/* Tarjeta de Rifa Principal / Activa */}
          <div className={styles.activeRaffleCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.badgesRow}>
                  {renderStatusBadge(activeRaffle.status)}
                  <span className={styles.raffleEditionTag}>
                    Slug: <code>{activeRaffle.slug}</code>
                  </span>
                  {activeRaffle.id === selectedRaffleId ? (
                    <span
                      className={styles.raffleEditionTag}
                      style={{
                        borderColor: 'rgba(217, 119, 6, 0.5)',
                        color: '#fbbf24',
                        background: 'rgba(217, 119, 6, 0.15)',
                        fontWeight: 600,
                      }}
                    >
                      ★ Activa en el Panel
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={adminStyles.btnSecondary}
                      style={{
                        padding: '0.2rem 0.55rem',
                        fontSize: '0.75rem',
                        borderColor: '#d97706',
                        color: '#fbbf24',
                      }}
                      onClick={() => setSelectedRaffleId(activeRaffle.id)}
                      title="Seleccionar esta rifa para gestionar en todo el panel"
                    >
                      Gestionar en Panel
                    </button>
                  )}
                </div>
                <h2 className={styles.raffleTitle}>{activeRaffle.title}</h2>
                <p className={styles.raffleDescription}>{activeRaffle.description}</p>
              </div>

              <button
                type="button"
                className={adminStyles.btnSecondary}
                onClick={() => setSelectedRaffleToEdit(activeRaffle)}
              >
                <Edit3 size={16} />
                <span>Editar Parámetros</span>
              </button>
            </div>

            {/* Barra de Progreso de Emisión y Ventas */}
            <div className={styles.salesProgressSection}>
              <div className={styles.progressInfoRow}>
                <div className={styles.progressLabelGroup}>
                  <TrendingUp size={16} style={{ color: '#34d399' }} />
                  <span className={styles.progressLabel}>Rendimiento de Ventas</span>
                  <span className={styles.progressBadge}>
                    {activeRaffle.sales_percentage}% vendido
                  </span>
                </div>
                <div className={styles.progressStats}>
                  <strong>{activeRaffle.sold_tickets}</strong> de{' '}
                  <strong>{activeRaffle.total_tickets}</strong> boletos pagados (
                  <strong style={{ color: '#34d399' }}>
                    {formatCOP(activeRaffle.total_revenue)}
                  </strong>{' '}
                  recaudados)
                </div>
              </div>

              <div className={styles.progressBarContainer}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${Math.min(100, activeRaffle.sales_percentage)}%` }}
                />
              </div>
            </div>

            {/* Grilla de Métricas Operativas */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricLabel}>Precio Unitario</span>
                  <div className={styles.metricIcon}>
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className={styles.metricValue}>
                  {formatCOP(Number(activeRaffle.ticket_price) || 0)} COP
                </div>
                <span className={styles.metricHint}>Por boleto individual</span>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricLabel}>Total Emisión</span>
                  <div className={styles.metricIcon}>
                    <Layers size={18} />
                  </div>
                </div>
                <div className={styles.metricValue}>
                  {activeRaffle.total_tickets.toLocaleString('es-CO')} Boletos
                </div>
                <span className={styles.metricHint}>
                  {activeRaffle.available_tickets} disponibles • {activeRaffle.reserved_tickets} en
                  reserva
                </span>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricLabel}>Modalidad Sorteo</span>
                  <div className={styles.metricIcon}>
                    <Award size={18} />
                  </div>
                </div>
                <div className={styles.metricValue} style={{ fontSize: '1.15rem' }}>
                  {activeRaffle.lottery_reference || 'Lotería de Santander'}
                </div>
                <span className={styles.metricHint}>Premio mayor auditable</span>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <span className={styles.metricLabel}>Fecha de Sorteo</span>
                  <div className={styles.metricIcon}>
                    <Calendar size={18} />
                  </div>
                </div>
                <div className={styles.metricValue} style={{ fontSize: '1.1rem' }}>
                  {formatColombianDate(activeRaffle.draw_date)}
                </div>
                <span className={styles.metricHint}>
                  Límite: {activeRaffle.max_tickets_per_buyer || 50} boletos / comprador
                </span>
              </div>
            </div>
          </div>

          {/* Listado de Otras Ediciones / Historial de Rifas si existen */}
          {otherRaffles.length > 0 && (
            <div className={styles.otherRafflesSection}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  Otras Ediciones y Sorteos ({otherRaffles.length})
                </h3>
              </div>

              <div className={styles.otherRafflesGrid}>
                {otherRaffles.map((r) => (
                  <div key={r.id} className={styles.otherRaffleCard}>
                    <div className={styles.otherCardTop}>
                      <div>
                        <div
                          style={{
                            marginBottom: '0.35rem',
                            display: 'flex',
                            gap: '0.4rem',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {renderStatusBadge(r.status)}
                          {r.id === selectedRaffleId ? (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#fbbf24',
                                fontWeight: 600,
                                background: 'rgba(217, 119, 6, 0.15)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                border: '1px solid rgba(217, 119, 6, 0.4)',
                              }}
                            >
                              ★ Activa en Panel
                            </span>
                          ) : null}
                        </div>
                        <h4 className={styles.otherTitle}>{r.title}</h4>
                        <span className={styles.otherSlug}>Slug: {r.slug}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {r.id !== selectedRaffleId && (
                          <button
                            type="button"
                            className={adminStyles.btnSecondary}
                            onClick={() => setSelectedRaffleId(r.id)}
                            style={{
                              padding: '0.35rem 0.55rem',
                              fontSize: '0.75rem',
                              borderColor: '#d97706',
                              color: '#fbbf24',
                            }}
                            title="Seleccionar esta rifa para filtrar el panel"
                          >
                            Gestionar
                          </button>
                        )}
                        <button
                          type="button"
                          className={adminStyles.btnSecondary}
                          onClick={() => setSelectedRaffleToEdit(r)}
                          style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem' }}
                        >
                          <Edit3 size={13} />
                          <span>Editar</span>
                        </button>
                      </div>
                    </div>

                    <div className={styles.otherStatsRow}>
                      <div className={styles.otherStatItem}>
                        <span className={styles.otherStatLabel}>Precio</span>
                        <strong className={styles.otherStatVal}>
                          {formatCOP(Number(r.ticket_price) || 0)}
                        </strong>
                      </div>
                      <div className={styles.otherStatItem}>
                        <span className={styles.otherStatLabel}>Emisión</span>
                        <strong className={styles.otherStatVal}>{r.total_tickets} boletos</strong>
                      </div>
                      <div className={styles.otherStatItem}>
                        <span className={styles.otherStatLabel}>Sorteo</span>
                        <span style={{ fontSize: '0.8rem', color: '#9cb5ab' }}>
                          {formatColombianDate(r.draw_date)}
                        </span>
                      </div>
                      <div className={styles.otherStatItem}>
                        <span className={styles.otherStatLabel}>Vendidos</span>
                        <strong style={{ color: '#34d399', fontSize: '0.85rem' }}>
                          {r.sold_tickets} ({r.sales_percentage}%)
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Edición de Parámetros */}
      <AdminEditRaffleModal
        raffle={selectedRaffleToEdit}
        isOpen={!!selectedRaffleToEdit}
        onClose={() => setSelectedRaffleToEdit(null)}
        onSuccess={handleEditSuccess}
      />

      {/* Modal de Creación de Rifa */}
      <AdminCreateRaffleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
};
