import React from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react';
import { formatCOP } from '@/lib/utils';
import styles from './AdminDeleteRaffleModal.module.css';

interface AdminDeleteRaffleModalProps {
  raffle: RaffleRow | null;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AdminDeleteRaffleModal: React.FC<AdminDeleteRaffleModalProps> = ({
  raffle,
  isOpen,
  isLoading,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !raffle) return null;

  const isActive = raffle.status === 'active';

  const formatDrawDate = (dateStr?: string | null) => {
    if (!dateStr) return 'No definida';
    try {
      return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-raffle-title"
    >
      <div className={styles.modal}>
        {/* Cabecera */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Trash2 size={22} aria-hidden="true" />
          </div>
          <div className={styles.headerText}>
            <h2 id="delete-raffle-title" className={styles.title}>
              Eliminar Edición de Rifa
            </h2>
            <p className={styles.subtitle}>
              Esta acción eliminará la rifa y toda su emisión de boletos
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
              <span className={styles.previewValue}>{raffle.title}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Estado Actual:</span>
              <span className={styles.statusBadge} data-status={raffle.status}>
                {raffle.status}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Total Boletos Emitidos:</span>
              <span className={styles.previewValue}>
                {raffle.total_tickets?.toLocaleString('es-CO')} boletos
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Precio por Boleto:</span>
              <span className={styles.previewValue}>
                {formatCOP(Number(raffle.ticket_price) || 0)} COP
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Fecha de Sorteo:</span>
              <span className={styles.previewValue}>
                {formatDrawDate(raffle.draw_date)}
              </span>
            </div>
          </div>

          <div className={styles.warningBox} role="alert">
            <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>
                {isActive
                  ? '¡ADVERTENCIA: Esta rifa está ACTIVA en la web pública!'
                  : '¿Confirmas la eliminación definitiva de esta rifa?'}
              </strong>
              <p style={{ margin: '0.25rem 0 0 0' }}>
                {isActive
                  ? 'Al eliminar la rifa activa, la página de inicio pública quedará sin rifa activa para la venta hasta que publiques otra. Se limpiarán sus boletos, órdenes y registros asociados.'
                  : 'Se eliminarán de forma irreversible todos los boletos emitidos, órdenes vinculadas y registros operativos asociados a esta edición.'}
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
                <span>Confirmar — Eliminar Rifa</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
