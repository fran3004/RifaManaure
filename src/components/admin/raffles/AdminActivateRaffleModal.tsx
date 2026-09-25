import React from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { Globe, Pause, Loader2, X, AlertTriangle } from 'lucide-react';
import styles from './AdminActivateRaffleModal.module.css';

interface AdminActivateRaffleModalProps {
  raffle: RaffleRow | null;
  mode: 'activate' | 'pause';
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AdminActivateRaffleModal: React.FC<AdminActivateRaffleModalProps> = ({
  raffle,
  mode,
  isOpen,
  isLoading,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !raffle) return null;

  const isActivate = mode === 'activate';

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activation-modal-title"
    >
      <div className={styles.modal}>
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.headerIcon} data-mode={mode}>
            {isActivate ? (
              <Globe size={22} aria-hidden="true" />
            ) : (
              <Pause size={22} aria-hidden="true" />
            )}
          </div>
          <div className={styles.headerText}>
            <h2 id="activation-modal-title" className={styles.title}>
              {isActivate ? 'Activar en la Web Pública' : 'Pausar Venta Pública'}
            </h2>
            <p className={styles.subtitle}>
              {isActivate
                ? 'Esta acción afecta lo que los compradores ven en este momento'
                : 'Los compradores no podrán adquirir boletos mientras esté pausada'}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            disabled={isLoading}
            aria-label="Cancelar"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className={styles.body}>
          <div className={styles.rafflePreview}>
            <span className={styles.rafflePreviewLabel}>Rifa seleccionada</span>
            <strong className={styles.rafflePreviewTitle}>{raffle.title}</strong>
          </div>

          {isActivate ? (
            <p className={styles.confirmText}>
              ¿Deseas activar{' '}
              <strong>"{raffle.title}"</strong> como la rifa pública principal?
              <br />
              <span className={styles.confirmNote}>
                Se publicará de inmediato en la página de inicio. La rifa activa anterior
                pasará a estado <strong>Pausado</strong> automáticamente.
              </span>
            </p>
          ) : (
            <p className={styles.confirmText}>
              ¿Deseas pausar la venta pública de{' '}
              <strong>"{raffle.title}"</strong>?
              <br />
              <span className={styles.confirmNote}>
                Los compradores no podrán adquirir boletos hasta que la rifa sea reactivada
                manualmente por un administrador.
              </span>
            </p>
          )}

          {/* Error de backend */}
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
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btnConfirm} ${isActivate ? styles.btnActivate : styles.btnPause}`}
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
                {isActivate ? 'Activando...' : 'Pausando...'}
              </>
            ) : (
              <>
                {isActivate ? (
                  <Globe size={16} aria-hidden="true" />
                ) : (
                  <Pause size={16} aria-hidden="true" />
                )}
                {isActivate ? 'Confirmar — Activar ahora' : 'Confirmar — Pausar venta'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
