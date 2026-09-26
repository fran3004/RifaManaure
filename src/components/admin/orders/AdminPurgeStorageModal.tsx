import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  Database,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import {
  adminGetPaymentProofsStorageStats,
  adminPurgePaymentProofsStorage,
  type StorageStatsResult,
  type PurgeStorageResult,
} from '@/services/paymentService';
import styles from './AdminPurgeStorageModal.module.css';

interface AdminPurgeStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: PurgeStorageResult) => void;
  selectedRaffleId?: string | null;
  selectedRaffleTitle?: string | null;
}

export const AdminPurgeStorageModal: React.FC<AdminPurgeStorageModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedRaffleId,
  selectedRaffleTitle,
}) => {
  const [scope, setScope] = useState<'resolved' | 'all'>('resolved');
  const [filterByCurrentRaffle, setFilterByCurrentRaffle] = useState<boolean>(Boolean(selectedRaffleId));
  const [stats, setStats] = useState<StorageStatsResult | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeRaffleId = filterByCurrentRaffle ? selectedRaffleId : null;

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const res = await adminGetPaymentProofsStorageStats(activeRaffleId);
      if (res.success) {
        setStats(res);
      } else {
        setError(res.error || 'No fue posible cargar las estadísticas de almacenamiento.');
      }
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoadingStats(false);
    }
  }, [activeRaffleId]);

  useEffect(() => {
    if (isOpen) {
      setFilterByCurrentRaffle(Boolean(selectedRaffleId));
      setScope('resolved');
      setError(null);
      void loadStats();
    }
  }, [isOpen, selectedRaffleId, loadStats]);

  if (!isOpen) return null;

  const handleConfirmPurge = async () => {
    setIsPurging(true);
    setError(null);
    try {
      const result = await adminPurgePaymentProofsStorage({
        scope,
        raffleId: activeRaffleId,
      });

      if (!result.success) {
        setError(result.error || 'No fue posible ejecutar el vaciado del almacenamiento.');
        setIsPurging(false);
        return;
      }

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado al vaciar almacenamiento.');
    } finally {
      setIsPurging(false);
    }
  };

  const targetCount = scope === 'resolved' 
    ? (stats?.resolvedFilesCount ?? 0) 
    : (stats?.activeFilesCount ?? 0);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="purge-modal-title"
      onClick={() => !isPurging && onClose()}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Database size={22} aria-hidden="true" />
          </div>
          <div className={styles.headerText}>
            <h3 id="purge-modal-title" className={styles.title}>
              Vaciar Almacenamiento de Comprobantes
            </h3>
            <p className={styles.subtitle}>
              Liberación manual de espacio en almacenamiento de transferencias bancarias
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isPurging}
            title="Cerrar modal"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.body}>
          {/* Métricas de Diagnóstico */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
              <span className={styles.statLabel}>Resueltos por Vaciar</span>
              <span className={styles.statValue}>
                {loadingStats ? '...' : (stats?.resolvedFilesCount ?? 0)}
              </span>
              <span className={styles.statHint}>
                Aprobados y rechazados listos para depuración
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Pendientes de Revisión</span>
              <span className={styles.statValue}>
                {loadingStats ? '...' : (stats?.pendingFilesCount ?? 0)}
              </span>
              <span className={styles.statHint}>
                {scope === 'resolved' ? 'Protegidos (no se eliminan)' : 'En espera de validación'}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Archivos en Disco</span>
              <span className={styles.statValue}>
                {loadingStats ? '...' : (stats?.activeFilesCount ?? 0)}
              </span>
              <span className={styles.statHint}>Comprobantes con archivo adjunto</span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Ya Depurados</span>
              <span className={styles.statValue}>
                {loadingStats ? '...' : (stats?.purgedFilesCount ?? 0)}
              </span>
              <span className={styles.statHint}>Espacio previamente liberado</span>
            </div>
          </div>

          {/* Selector de Ámbito por Rifa */}
          {selectedRaffleId && selectedRaffleTitle && (
            <label className={styles.raffleScopeRow}>
              <input
                type="checkbox"
                checked={filterByCurrentRaffle}
                onChange={(e) => setFilterByCurrentRaffle(e.target.checked)}
                disabled={isPurging}
                className={styles.raffleCheckbox}
              />
              <span>
                Aplicar solo a la rifa actual:{' '}
                <strong>{selectedRaffleTitle}</strong>
              </span>
            </label>
          )}

          {/* Opciones de Alcance */}
          <div className={styles.scopeOptions}>
            <span className={styles.scopeOptionLabel}>Modo de Vaciado:</span>

            {/* Opción 1: Resueltos (Recomendado) */}
            <div
              className={`${styles.scopeCard} ${scope === 'resolved' ? styles.scopeCardActive : ''}`}
              onClick={() => !isPurging && setScope('resolved')}
            >
              <input
                type="radio"
                name="purgeScope"
                value="resolved"
                checked={scope === 'resolved'}
                onChange={() => setScope('resolved')}
                disabled={isPurging}
                className={styles.scopeRadio}
              />
              <div className={styles.scopeTextGroup}>
                <span className={styles.scopeTitle}>
                  Solo Comprobantes Resueltos (Recomendado)
                </span>
                <span className={styles.scopeDesc}>
                  Elimina de inmediato los archivos de compras <strong>aprobadas o rechazadas</strong> sin esperar los 5 días de retención. Los comprobantes pendientes de validación se mantienen <strong>100% protegidos</strong>.
                </span>
              </div>
            </div>

            {/* Opción 2: Vaciar Todo */}
            <div
              className={`${styles.scopeCard} ${scope === 'all' ? styles.scopeCardActive : ''}`}
              onClick={() => !isPurging && setScope('all')}
            >
              <input
                type="radio"
                name="purgeScope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                disabled={isPurging}
                className={styles.scopeRadio}
              />
              <div className={styles.scopeTextGroup}>
                <span className={styles.scopeTitle}>
                  Vaciar Todo el Almacenamiento
                </span>
                <span className={styles.scopeDesc}>
                  Elimina <strong>todos los archivos de comprobantes</strong> del bucket (incluyendo comprobantes pendientes y archivos huérfanos). Toda la información contable y boletos permanecen intactos.
                </span>
              </div>
            </div>
          </div>

          {/* Alerta de Confirmación de Alto Contraste */}
          <div className={styles.warningBox} role="alert">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>¿Confirmas el vaciado inmediato de almacenamiento?</strong>
              <p>
                Esta acción eliminará físicamente los archivos adjuntos (imágenes/PDFs) del almacenamiento para liberar espacio. Los registros contables, compradores, referencias y boletos vendidos <strong>permanecerán 100% protegidos e intactos</strong> en la base de datos.
              </p>
            </div>
          </div>

          {error && (
            <div className={styles.errorBox} role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isPurging}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPurge}
            onClick={handleConfirmPurge}
            disabled={isPurging || loadingStats}
            title="Proceder con el vaciado manual de comprobantes"
          >
            {isPurging ? (
              <>
                <Loader2 size={16} className={styles.spinner} />
                <span>Vaciando almacenamiento...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>
                  Confirmar — Vaciar ({targetCount} {targetCount === 1 ? 'archivo' : 'archivos'})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
