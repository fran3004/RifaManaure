import React, { useState, useEffect, useCallback } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import {
  fetchAdminRaffles,
  activateRafflePublic,
  pauseRafflePublic,
  type RaffleWithStats,
} from '@/services/raffleService';
import { saveCachedRaffle } from '@/hooks/useActiveRaffle';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { AdminEditRaffleModal } from '@/components/admin/raffles/AdminEditRaffleModal';
import { AdminCreateRaffleModal } from '@/components/admin/raffles/AdminCreateRaffleModal';
import { AdminActivateRaffleModal } from '@/components/admin/raffles/AdminActivateRaffleModal';
import { formatCOP } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
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
  Globe,
  Pause,
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

interface ActivationModalState {
  raffle: RaffleRow;
  mode: 'activate' | 'pause';
}

export const RafflesView: React.FC = () => {
  const { selectedRaffleId, setSelectedRaffleId, reloadRaffles } = useAdminRaffle();
  const [raffles, setRaffles] = useState<RaffleWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [selectedRaffleToEdit, setSelectedRaffleToEdit] = useState<RaffleRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Estado del modal de activación/pausa pública
  const [activationModal, setActivationModal] = useState<ActivationModalState | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const loadRaffles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAdminRaffles();
      if (res.success) {
        setRaffles(res.raffles);
        setIsForbidden(false);
      } else {
        const normalized = normalizeAppError(
          { message: res.error },
          'No fue posible cargar las rifas desde la base de datos.'
        );
        logAppError('RafflesView.loadRaffles.res', normalized);
        setError(normalized.userMessage);
        setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
      }
    } catch (err: unknown) {
      const normalized = normalizeAppError(
        err,
        'Error inesperado de red al consultar el catálogo de rifas.'
      );
      logAppError('RafflesView.loadRaffles.catch', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
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
            setIsForbidden(false);
          } else {
            const normalized = normalizeAppError(
              { message: res.error },
              'No fue posible cargar las rifas desde la base de datos.'
            );
            logAppError('RafflesView.init.res', normalized);
            setError(normalized.userMessage);
            setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
          }
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (active) {
          const normalized = normalizeAppError(err, 'Error al cargar las rifas.');
          logAppError('RafflesView.init.catch', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
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
      message: `Los parámetros de "${updated.title}" fueron actualizados exitosamente.`,
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

  // ─── Activación / Pausa pública ─────────────────────────────────────────────

  const openActivationModal = (raffle: RaffleRow, mode: 'activate' | 'pause') => {
    setActivationError(null);
    setActivationModal({ raffle, mode });
  };

  const closeActivationModal = () => {
    if (isActivating) return; // evitar cerrar durante operación
    setActivationModal(null);
    setActivationError(null);
  };

  const handleConfirmActivation = useCallback(async () => {
    if (!activationModal || isActivating) return;

    setIsActivating(true);
    setActivationError(null);

    const { raffle, mode } = activationModal;

    try {
      const result =
        mode === 'activate'
          ? await activateRafflePublic(raffle)
          : await pauseRafflePublic(raffle);

      if (!result.success) {
        setActivationError(result.error ?? 'Error al procesar la operación.');
        return;
      }

      // Sincronización inmediata: actualizar caché y emitir evento custom
      if (result.raffle) {
        saveCachedRaffle(result.raffle);
      }

      // Refrescar catálogo administrativo
      await loadRaffles();
      void reloadRaffles();

      // Si se activó, seleccionarla automáticamente en el panel también
      if (mode === 'activate') {
        setSelectedRaffleId(raffle.id);
      }

      setActivationModal(null);
      setFeedback({
        type: 'success',
        message:
          mode === 'activate'
            ? `"${raffle.title}" fue publicada como la rifa activa. La anterior quedó pausada.`
            : `La venta pública de "${raffle.title}" fue pausada correctamente.`,
      });
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error inesperado al cambiar estado de la rifa.');
      setActivationError(normalized.userMessage);
    } finally {
      setIsActivating(false);
    }
  }, [activationModal, isActivating, loadRaffles, reloadRaffles, setSelectedRaffleId]);

  // ─── Identificación de rifas ─────────────────────────────────────────────────

  const activeRaffle =
    raffles.find((r) => r.status === 'active') || (raffles.length > 0 ? raffles[0] : null);
  const otherRaffles = activeRaffle ? raffles.filter((r) => r.id !== activeRaffle.id) : [];

  const trueActiveRaffle = raffles.find((r) => r.status === 'active') || null;

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

  const activeSalesProgressStyle: React.CSSProperties | undefined = activeRaffle
    ? ({
        ['--progress-percentage' as string]: `${Math.min(100, activeRaffle.sales_percentage)}%`,
      } as React.CSSProperties)
    : undefined;

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
          <div className={styles.headerActions}>
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
          <div className={styles.feedbackContent}>
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
          <AdminLoadingState message="Cargando catálogo de rifas..." />
        </div>
      ) : error ? (
        <div className={adminStyles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar rifas'}
            message={error}
            isForbidden={isForbidden}
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
          {/* ── Tarjeta de Rifa Principal ── */}
          <div className={styles.activeRaffleCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.badgesRow}>
                  {renderStatusBadge(activeRaffle.status)}

                  {/* Indicador inequívoco: visible públicamente o no */}
                  {activeRaffle.status === 'active' ? (
                    <span className={styles.publicLiveBadge} aria-label="Rifa visible en la web pública">
                      <Globe size={11} aria-hidden="true" />
                      Visible y Activa en la Web Pública
                    </span>
                  ) : (
                    <span className={styles.notPublicBadge}>
                      No publicada actualmente
                    </span>
                  )}

                  {/* Indicador de panel — separado del estado público */}
                  {activeRaffle.id === selectedRaffleId ? (
                    <span className={`${styles.raffleEditionTag} ${styles.activeInPanelTag}`}>
                      ★ Seleccionada en el panel
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`${adminStyles.btnSecondary} ${styles.btnSelectInPanel}`}
                      onClick={() => setSelectedRaffleId(activeRaffle.id)}
                      title="Seleccionar esta rifa para gestionar en todo el panel (sin publicar)"
                    >
                      Usar en el panel
                    </button>
                  )}
                </div>
                <h2 className={styles.raffleTitle}>{activeRaffle.title}</h2>
                <p className={styles.raffleDescription}>{activeRaffle.description}</p>
              </div>

              <div className={styles.cardActions}>
                {/* Acción pública — visualmente separada de "Editar Parámetros" */}
                {activeRaffle.status === 'active' ? (
                  // Rifa activa → ofrecer Pausar
                  <button
                    type="button"
                    className={`${adminStyles.btnSecondary} ${styles.btnPausePublic}`}
                    onClick={() => openActivationModal(activeRaffle, 'pause')}
                    title="Pausar la venta pública de esta rifa"
                  >
                    <Pause size={15} aria-hidden="true" />
                    <span>Pausar Venta Pública</span>
                  </button>
                ) : (
                  // Rifa no activa → ofrecer Activar
                  <button
                    type="button"
                    className={`${adminStyles.btnPrimary} ${styles.btnActivatePublic}`}
                    onClick={() => openActivationModal(activeRaffle, 'activate')}
                    title="Publicar esta rifa en la web pública para compradores"
                  >
                    <Globe size={15} aria-hidden="true" />
                    <span>Activar en Web Pública</span>
                  </button>
                )}

                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  onClick={() => setSelectedRaffleToEdit(activeRaffle)}
                >
                  <Edit3 size={16} />
                  <span>Editar Parámetros</span>
                </button>
              </div>
            </div>

            {/* Barra de Progreso de Emisión y Ventas */}
            <div className={styles.salesProgressSection}>
              <div className={styles.progressInfoRow}>
                <div className={styles.progressLabelGroup}>
                  <TrendingUp size={16} className={styles.progressIcon} />
                  <span className={styles.progressLabel}>Rendimiento de Ventas</span>
                  <span className={styles.progressBadge}>
                    {activeRaffle.sales_percentage}% vendido
                  </span>
                </div>
                <div className={styles.progressStats}>
                  <strong>{activeRaffle.sold_tickets}</strong> de{' '}
                  <strong>{activeRaffle.total_tickets}</strong> boletos pagados (
                  <strong className={styles.revenueHighlight}>
                    {formatCOP(activeRaffle.total_revenue)}
                  </strong>{' '}
                  recaudados)
                </div>
              </div>

              <div
                className={styles.progressBarContainer}
                style={activeSalesProgressStyle}
              >
                <div className={styles.progressBarFill} />
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
                <div className={`${styles.metricValue} ${styles.metricValueMedium}`}>
                  {activeRaffle.lottery_reference || 'Lotería Oficial'}
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
                <div className={`${styles.metricValue} ${styles.metricValueDate}`}>
                  {formatColombianDate(activeRaffle.draw_date)}
                </div>
                <span className={styles.metricHint}>
                  Límite: {activeRaffle.max_tickets_per_buyer || 50} boletos / comprador
                </span>
              </div>
            </div>
          </div>

          {/* ── Listado de Otras Ediciones ── */}
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
                        <div className={styles.otherBadgesRow}>
                          {renderStatusBadge(r.status)}
                          {/* Panel badge — solo indica selección en el panel, no estado público */}
                          {r.id === selectedRaffleId ? (
                            <span className={styles.otherPanelBadge}>
                              ★ Seleccionada en el panel
                            </span>
                          ) : null}
                        </div>
                        <h4 className={styles.otherTitle}>{r.title}</h4>
                      </div>

                      <div className={styles.otherActionsGroup}>
                        {/* Selección de panel — acción neutral, sin publicar */}
                        {r.id !== selectedRaffleId && (
                          <button
                            type="button"
                            className={`${adminStyles.btnSecondary} ${styles.btnUsePanelSmall}`}
                            onClick={() => setSelectedRaffleId(r.id)}
                            title="Ver esta rifa en el panel (sin publicarla)"
                          >
                            Usar en panel
                          </button>
                        )}

                        {/* Activación pública — solo si no está finalizada ni cerrada */}
                        {r.status !== 'active' &&
                          r.status !== 'finished' &&
                          r.status !== 'closed' && (
                            <button
                              type="button"
                              className={`${styles.btnActivateOther}`}
                              onClick={() => openActivationModal(r, 'activate')}
                              title="Publicar esta rifa como la activa para compradores"
                            >
                              <Globe size={13} aria-hidden="true" />
                              Activar en Web Pública
                            </button>
                          )}

                        {/* Pausa pública — solo si está activa */}
                        {r.status === 'active' && trueActiveRaffle?.id !== activeRaffle.id && (
                          <button
                            type="button"
                            className={`${styles.btnPauseOther}`}
                            onClick={() => openActivationModal(r, 'pause')}
                            title="Pausar venta pública de esta rifa"
                          >
                            <Pause size={13} aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          className={`${adminStyles.btnSecondary} ${styles.btnEditSmall}`}
                          onClick={() => setSelectedRaffleToEdit(r)}
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
                        <span className={styles.otherDrawDate}>
                          {formatColombianDate(r.draw_date)}
                        </span>
                      </div>
                      <div className={styles.otherStatItem}>
                        <span className={styles.otherStatLabel}>Vendidos</span>
                        <strong className={styles.otherSoldValue}>
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

      {/* Modal de Activación / Pausa Pública */}
      <AdminActivateRaffleModal
        raffle={activationModal?.raffle ?? null}
        mode={activationModal?.mode ?? 'activate'}
        isOpen={!!activationModal}
        isLoading={isActivating}
        error={activationError}
        onConfirm={handleConfirmActivation}
        onCancel={closeActivationModal}
      />
    </div>
  );
};
