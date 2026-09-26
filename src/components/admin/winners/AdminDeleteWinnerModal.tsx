import React from 'react';
import type { WinnerWithDetails } from '@/types/raffle.types';
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react';
import styles from './AdminDeleteWinnerModal.module.css';

interface AdminDeleteWinnerModalProps {
  winner: WinnerWithDetails | null;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AdminDeleteWinnerModal: React.FC<AdminDeleteWinnerModalProps> = ({
  winner,
  isOpen,
  isLoading,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !winner) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-winner-title"
    >
      <div className={styles.modal}>
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Trash2 size={22} aria-hidden="true" />
          </div>
          <div className={styles.headerText}>
            <h2 id="delete-winner-title" className={styles.title}>
              Eliminar Ganador Oficial
            </h2>
            <p className={styles.subtitle}>
              Esta acción revocará la asignación del boleto ganador
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
          <div className={styles.previewBox}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Rifa:</span>
              <span className={styles.previewValue}>
                {winner.raffle?.title || 'Rifa Oficial'}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Boleto Ganador:</span>
              <span className={styles.ticketBadge}>#{winner.ticket_number}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Comprador Ganador:</span>
              <span className={styles.previewValue}>
                {winner.buyer?.full_name || 'Comprador Registrado'}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Lotería de Referencia:</span>
              <span className={styles.previewValue}>
                {winner.raffle?.lottery_reference || 'Lotería Oficial'} (#{winner.lottery_draw_number})
              </span>
            </div>
          </div>

          <div className={styles.warningBox} role="alert">
            <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>¿Deseas eliminar este registro de ganador?</strong>
              <p style={{ margin: '0.25rem 0 0 0' }}>
                Al eliminarlo, la rifa pasará a estado <strong>Cerrada</strong> y quedará lista para ser reactivada, reprogramada o reutilizada. La página pública dejará de mostrar la celebración del ganador inmediatamente.
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
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnDelete}
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
                <span>Eliminando...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} aria-hidden="true" />
                <span>Confirmar — Eliminar Ganador</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
