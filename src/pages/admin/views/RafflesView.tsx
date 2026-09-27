import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import {
  fetchAdminRaffles,
  activateRafflePublic,
  pauseRafflePublic,
  deleteRaffleAdmin,
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
import { AdminDeleteRaffleModal } from '@/components/admin/raffles/AdminDeleteRaffleModal';
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
  Trash2,
  MoreHorizontal,
  ExternalLink,
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

  // Estado del modal de eliminación de rifa
  const [raffleToDelete, setRaffleToDelete] = useState<RaffleRow | null>(null);
  const [isDeletingRaffle, setIsDeletingRaffle] = useState(false);
  const [deleteRaffleError, setDeleteRaffleError] = useState<string | null>(null);

  // Menú contextual desplegable de acciones secundarias de la rifa principal
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActionsMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsMenuOpen]);

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
          'No fue posible cargar las rifas en este momento.'
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
              'No fue posible cargar las rifas en este momento.'
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
    if (isActivating) return;
    setActivationModal(null);
    setActivationError(null);
  };

  const handleConfirmActivation = useCallback(async (newDrawDate?: string) => {
    if (!activationModal || isActivating) return;

    setIsActivating(true);
    setActivationError(null);

    const { raffle, mode } = activationModal;

    try {
      const result =
        mode === 'activate'
          ? await activateRafflePublic(raffle, newDrawDate)
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

      // Si se activó, seleccionarla en el panel para mantener el foco en la rifa activa
      if (mode === 'activate') {
        setSelectedRaffleId(raffle.id);
      }

      setActivationModal(null);
      setFeedback({
        type: 'success',
        message:
          mode === 'activate'
            ? `"${raffle.title}" fue publicada como la rifa activa en la web. La anterior quedó pausada automáticamente.`
            : `La venta pública de "${raffle.title}" fue pausada correctamente.`,
      });
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error inesperado al cambiar estado de la rifa.');
      setActivationError(normalized.userMessage);
    } finally {
      setIsActivating(false);
    }
  }, [activationModal, isActivating, loadRaffles, reloadRaffles, setSelectedRaffleId]);

  // ─── Eliminación de Rifa ───────────────────────────────────────────────────────

  const handleOpenDeleteRaffleModal = (raffle: RaffleRow) => {
    setDeleteRaffleError(null);
    setRaffleToDelete(raffle);
  };

  const handleCloseDeleteRaffleModal = () => {
    if (isDeletingRaffle) return;
    setRaffleToDelete(null);
    setDeleteRaffleError(null);
  };

  const handleConfirmDeleteRaffle = async () => {
    if (!raffleToDelete || isDeletingRaffle) return;

    setIsDeletingRaffle(true);
    setDeleteRaffleError(null);

    try {
      const res = await deleteRaffleAdmin(raffleToDelete.id);
      if (!res.success) {
        setDeleteRaffleError(res.error || 'No fue posible eliminar la rifa.');
        return;
      }

      setRaffleToDelete(null);
      setFeedback({
        type: 'success',
        message: `La edición "${res.title || raffleToDelete.title}" fue eliminada exitosamente.`,
      });

      if (selectedRaffleId === raffleToDelete.id) {
        setSelectedRaffleId('');
      }

      await loadRaffles();
      void reloadRaffles();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error inesperado al eliminar la rifa.');
      setDeleteRaffleError(normalized.userMessage);
    } finally {
      setIsDeletingRaffle(false);
    }
  };

  // ─── Identificación de rifas ─────────────────────────────────────────────────
  // La rifa que se muestra en la tarjeta principal es la que está seleccionada en el panel
  // (o la activa pública como fallback si ninguna coincide).
  const panelRaffle =
    raffles.find((r) => r.id === selectedRaffleId) ||
    raffles.find((r) => r.status === 'active') ||
    (raffles.length > 0 ? raffles[0] : null);

  // Las otras rifas para el listado inferior son todas excepto la que está en la tarjeta principal
  const otherRaffles = panelRaffle ? raffles.filter((r) => r.id !== panelRaffle.id) : [];

  // Función para renderizar el badge de estado principal sin ambigüedades
  const renderPanelRaffleStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className={styles.badgePublicLive} title="Esta rifa está actualmente visible y abierta a compras en la página web pública">
            <span className={styles.livePulseDot} aria-hidden="true" />
            <span>Visible y Activa en Web</span>
          </span>
        );
      case 'paused':
        return (
          <span className={styles.badgePublicPaused} title="La venta de boletos está suspendida temporalmente">
            <Pause size={12} aria-hidden="true" />
            <span>Venta Pausada</span>
          </span>
        );
      case 'finished':
        return (
          <span className={styles.badgeFinished} title="El sorteo ya concluyó y tiene ganador oficial">
            <Award size={12} aria-hidden="true" />
            <span>Sorteo Finalizado</span>
          </span>
        );
      case 'closed':
        return (
          <span className={styles.badgeFinished} title="El sorteo está cerrado">
            <Lock size={12} aria-hidden="true" />
            <span>Sorteo Cerrado</span>
          </span>
        );
      default:
        return (
          <span className={styles.badgeDraft} title="Esta rifa está en borrador y no es visible para compradores">
            <AlertCircle size={12} aria-hidden="true" />
            <span>Borrador</span>
          </span>
        );
    }
  };

  // Badge compacto para las tarjetas secundarias
  const renderOtherRaffleStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className={styles.badgePublicLiveSmall}>
            <Globe size={11} aria-hidden="true" />
            Activa en Web
          </span>
        );
      case 'paused':
        return (
          <span className={styles.badgePausedSmall}>
            <Clock size={11} aria-hidden="true" />
            Pausada
          </span>
        );
      case 'finished':
        return (
          <span className={styles.badgeFinishedSmall}>
            <Award size={11} aria-hidden="true" />
            Finalizada
          </span>
        );
      case 'closed':
        return (
          <span className={styles.badgeFinishedSmall}>
            <Lock size={11} aria-hidden="true" />
            Cerrada
          </span>
        );
      default:
        return (
          <span className={styles.badgeDraftSmall}>
            <AlertCircle size={11} aria-hidden="true" />
            Borrador
          </span>
        );
    }
  };

  const activeSalesProgressStyle: React.CSSProperties | undefined = panelRaffle
    ? ({
        ['--progress-percentage' as string]: `${Math.min(100, panelRaffle.sales_percentage)}%`,
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
      ) : !panelRaffle ? (
        <AdminEmptyState
          icon={<Sparkles size={40} />}
          title="No hay rifas registradas"
          description="Aún no se ha creado ninguna edición de sorteo en el sistema. Puedes crear la primera haciendo clic en 'Nueva Rifa'."
        />
      ) : (
        <>
          {/* ── Tarjeta de Rifa en Gestión del Panel (Principal) ── */}
          <div className={styles.activeRaffleCard}>
            {/* ── 1. Barra Superior: Metadatos de Estado y Barra de Acciones Unificada ── */}
            <div className={styles.cardTopMetaBar}>
              <div className={styles.statusBadgesGroup}>
                {/* Badge de foco en el panel de control */}
                <span
                  className={styles.badgePanelContext}
                  title="Esta es la edición sobre la que operan todos los módulos del panel (boletos, órdenes, compradores)"
                >
                  <Layers size={13} aria-hidden="true" />
                  <span>Edición en Gestión</span>
                </span>

                {/* Badge de estado en la web pública */}
                {renderPanelRaffleStatusBadge(panelRaffle.status)}
              </div>

              {/* Grupo de Acciones Unificado (Sin ruido visual ni botones desordenados) */}
              <div className={styles.cardActionsToolbar} ref={actionsMenuRef}>
                {/* Acción de venta pública */}
                {panelRaffle.status === 'active' ? (
                  <button
                    type="button"
                    className={styles.btnActionPause}
                    onClick={() => openActivationModal(panelRaffle, 'pause')}
                    title="Pausar temporalmente la venta pública de esta rifa"
                  >
                    <Pause size={14} aria-hidden="true" />
                    <span>Pausar Venta</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.btnActionActivate}
                    onClick={() => openActivationModal(panelRaffle, 'activate')}
                    title="Publicar esta rifa en la web para compradores"
                  >
                    <Globe size={14} aria-hidden="true" />
                    <span>Activar en Web</span>
                  </button>
                )}

                {/* Botón Editar: SIEMPRE disponible en la rifa que se está viendo en el panel */}
                <button
                  type="button"
                  className={styles.btnActionEdit}
                  onClick={() => setSelectedRaffleToEdit(panelRaffle)}
                  title="Modificar precio, fecha de sorteo, lotería y parámetros de esta rifa"
                >
                  <Edit3 size={14} aria-hidden="true" />
                  <span>Editar Parámetros</span>
                </button>

                {/* Menú de Más Opciones (...) */}
                <div className={styles.moreActionsContainer}>
                  <button
                    type="button"
                    className={`${styles.btnMoreActions} ${isActionsMenuOpen ? styles.btnMoreActionsActive : ''}`}
                    onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                    title="Más opciones de la rifa"
                    aria-haspopup="true"
                    aria-expanded={isActionsMenuOpen}
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>

                  {isActionsMenuOpen && (
                    <div className={styles.actionsDropdownMenu} role="menu">
                      <a
                        href="/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.dropdownMenuItem}
                        role="menuitem"
                        onClick={() => setIsActionsMenuOpen(false)}
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        <span>Ver en Web Pública</span>
                      </a>

                      <div className={styles.dropdownMenuDivider} role="separator" />

                      <button
                        type="button"
                        className={styles.dropdownMenuItemDanger}
                        role="menuitem"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          handleOpenDeleteRaffleModal(panelRaffle);
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span>Eliminar Rifa</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 2. Bloque de Identidad: Título y Descripción ── */}
            <div className={styles.identitySection}>
              <h2 className={styles.raffleTitle}>{panelRaffle.title}</h2>
              {panelRaffle.description && (
                <p className={styles.raffleDescription}>{panelRaffle.description}</p>
              )}
            </div>

            {/* ── 3. Panel Analítico: Rendimiento y Recaudación de Ventas ── */}
            <div className={styles.salesProgressSection}>
              <div className={styles.progressInfoRow}>
                <div className={styles.progressLabelGroup}>
                  <div className={styles.progressIconWrap}>
                    <TrendingUp size={15} />
                  </div>
                  <span className={styles.progressLabel}>Rendimiento de Ventas</span>
                  <span className={styles.progressBadge}>
                    {panelRaffle.sales_percentage}% vendido
                  </span>
                </div>
                <div className={styles.progressStats}>
                  <span className={styles.statTickets}>
                    <strong>{panelRaffle.sold_tickets}</strong> de{' '}
                    <strong>{panelRaffle.total_tickets}</strong> boletos pagados
                  </span>
                  <span className={styles.statDivider} aria-hidden="true">•</span>
                  <span className={styles.statRevenue}>
                    (
                    <strong className={styles.revenueHighlight}>
                      {formatCOP(panelRaffle.total_revenue)} COP
                    </strong>{' '}
                    recaudados)
                  </span>
                </div>
              </div>

              <div
                className={styles.progressBarContainer}
                style={activeSalesProgressStyle}
                role="progressbar"
                aria-valuenow={panelRaffle.sales_percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de ventas de la rifa"
              >
                <div className={styles.progressBarFill} />
              </div>
            </div>

            {/* ── 4. Grilla de Métricas Operativas (Armoniosa y Equilibrada) ── */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <div className={`${styles.metricIcon} ${styles.iconEmerald}`}>
                    <DollarSign size={16} />
                  </div>
                  <span className={styles.metricLabel}>Precio Unitario</span>
                </div>
                <div className={styles.metricBody}>
                  <div className={styles.metricValue}>
                    {formatCOP(Number(panelRaffle.ticket_price) || 0)} COP
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.metricHint}>Por boleto individual</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <div className={`${styles.metricIcon} ${styles.iconBlue}`}>
                    <Layers size={16} />
                  </div>
                  <span className={styles.metricLabel}>Total Emisión</span>
                </div>
                <div className={styles.metricBody}>
                  <div className={styles.metricValue}>
                    {panelRaffle.total_tickets.toLocaleString('es-CO')} Boletos
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.metricHint}>
                    <strong>{panelRaffle.available_tickets}</strong> disp. · <strong>{panelRaffle.reserved_tickets}</strong> reserva
                  </span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <div className={`${styles.metricIcon} ${styles.iconAmber}`}>
                    <Award size={16} />
                  </div>
                  <span className={styles.metricLabel}>Modalidad Sorteo</span>
                </div>
                <div className={styles.metricBody}>
                  <div
                    className={`${styles.metricValue} ${styles.metricValueText}`}
                    title={panelRaffle.lottery_reference || 'Lotería Oficial'}
                  >
                    {panelRaffle.lottery_reference || 'Lotería Oficial'}
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.metricHint}>Premio mayor auditable</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  <div className={`${styles.metricIcon} ${styles.iconPurple}`}>
                    <Calendar size={16} />
                  </div>
                  <span className={styles.metricLabel}>Fecha de Sorteo</span>
                </div>
                <div className={styles.metricBody}>
                  <div
                    className={`${styles.metricValue} ${styles.metricValueDate}`}
                    title={formatColombianDate(panelRaffle.draw_date)}
                  >
                    {formatColombianDate(panelRaffle.draw_date)}
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.metricHint}>
                    Límite: {panelRaffle.max_tickets_per_buyer || 50} boletos / comprador
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Listado de Otras Ediciones y Sorteos ── */}
          {otherRaffles.length > 0 && (
            <div className={styles.otherRafflesSection}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  Otras Ediciones y Sorteos ({otherRaffles.length})
                </h3>
                <span className={styles.sectionSubtitle}>
                  Haz clic en &ldquo;Usar en el panel&rdquo; para cargar y editar cualquier edición.
                </span>
              </div>

              <div className={styles.otherRafflesGrid}>
                {otherRaffles.map((r) => (
                  <div key={r.id} className={styles.otherRaffleCard}>
                    <div className={styles.otherCardTop}>
                      <div className={styles.otherCardInfo}>
                        <div className={styles.otherBadgesRow}>
                          {renderOtherRaffleStatusBadge(r.status)}
                        </div>
                        <h4 className={styles.otherTitle}>{r.title}</h4>
                      </div>

                      <button
                        type="button"
                        className={styles.btnUseInPanel}
                        onClick={() => setSelectedRaffleId(r.id)}
                        title={`Poner "${r.title}" en gestión en el panel para editarla y ver sus datos`}
                      >
                        <Layers size={14} aria-hidden="true" />
                        <span>Usar en el panel</span>
                      </button>
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

      {/* Modal de Confirmación de Activación / Pausa Pública */}
      <AdminActivateRaffleModal
        raffle={activationModal?.raffle ?? null}
        mode={activationModal?.mode ?? 'activate'}
        isOpen={!!activationModal}
        isLoading={isActivating}
        error={activationError}
        onConfirm={handleConfirmActivation}
        onCancel={closeActivationModal}
      />

      {/* Modal de Eliminación Definitiva de Rifa */}
      <AdminDeleteRaffleModal
        raffle={raffleToDelete}
        isOpen={!!raffleToDelete}
        isLoading={isDeletingRaffle}
        error={deleteRaffleError}
        onConfirm={handleConfirmDeleteRaffle}
        onCancel={handleCloseDeleteRaffleModal}
      />
    </div>
  );
};
