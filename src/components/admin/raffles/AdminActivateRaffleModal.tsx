import React, { useState, useEffect, useMemo } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { Globe, Pause, Loader2, X, AlertTriangle, Calendar } from 'lucide-react';
import styles from './AdminActivateRaffleModal.module.css';

interface AdminActivateRaffleModalProps {
  raffle: RaffleRow | null;
  mode: 'activate' | 'pause';
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  onConfirm: (newDrawDate?: string) => void;
  onCancel: () => void;
}

function getDefaultFutureDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocalString(isoString?: string | null): string {
  if (!isoString) return getDefaultFutureDate();
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return getDefaultFutureDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [newDrawDate, setNewDrawDate] = useState<string>('');

  const isActivate = mode === 'activate';

  const isDrawDateExpired = useMemo(() => {
    if (!raffle?.draw_date) return true;
    const d = new Date(raffle.draw_date);
    return isNaN(d.getTime()) || d.getTime() <= Date.now();
  }, [raffle?.draw_date]);

  const minDateTime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  useEffect(() => {
    if (isOpen && raffle) {
      if (isDrawDateExpired) {
        setNewDrawDate(getDefaultFutureDate());
      } else {
        setNewDrawDate(toDatetimeLocalString(raffle.draw_date));
      }
    }
  }, [isOpen, raffle, isDrawDateExpired]);

  if (!isOpen || !raffle) return null;

  const isDateSelectedValid = Boolean(
    newDrawDate && new Date(newDrawDate).getTime() > Date.now()
  );

  const canSubmit =
    !isLoading &&
    (!isActivate || !isDrawDateExpired || isDateSelectedValid);

  const handleConfirmClick = () => {
    if (!canSubmit) return;
    if (isActivate) {
      const finalIso = newDrawDate ? new Date(newDrawDate).toISOString() : undefined;
      onConfirm(finalIso);
    } else {
      onConfirm();
    }
  };

  const formatPreviousDate = (dateStr?: string | null) => {
    if (!dateStr) return 'No configurada';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

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
            <>
              <p className={styles.confirmText}>
                ¿Deseas activar <strong>"{raffle.title}"</strong> como la rifa pública principal?
                <br />
                <span className={styles.confirmNote}>
                  Se publicará de inmediato en la página de inicio. La rifa activa anterior
                  pasará a estado <strong>Pausado</strong> automáticamente.
                </span>
              </p>

              {isDrawDateExpired ? (
                <div className={styles.warningBox} role="alert">
                  <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div className={styles.warningBoxContent}>
                    <span className={styles.warningBoxTitle}>Fecha de sorteo vencida</span>
                    <p className={styles.warningBoxText}>
                      La fecha anterior (<strong>{formatPreviousDate(raffle.draw_date)}</strong>) ya concluyó. Asigna una nueva fecha y hora para que el sistema mantenga la rifa activa y los clientes puedan comprar boletos.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className={styles.datePickerGroup}>
                <label htmlFor="new-draw-date" className={styles.inputLabel}>
                  <Calendar size={14} aria-hidden="true" />
                  {isDrawDateExpired
                    ? 'Nueva Fecha y Hora del Sorteo (Requerida)'
                    : 'Fecha y Hora del Sorteo (Programada)'}
                </label>
                <input
                  id="new-draw-date"
                  type="datetime-local"
                  className={styles.dateTimeInput}
                  value={newDrawDate}
                  min={minDateTime}
                  onChange={(e) => setNewDrawDate(e.target.value)}
                  disabled={isLoading}
                  required={isDrawDateExpired}
                />
                <span
                  className={`${styles.inputHelp} ${
                    isDrawDateExpired && !isDateSelectedValid ? styles.inputHelpWarning : ''
                  }`}
                >
                  {isDrawDateExpired
                    ? isDateSelectedValid
                      ? 'Fecha futura válida. La rifa permanecerá activa para la venta.'
                      : 'Debes seleccionar una fecha y hora futura para poder activar la rifa.'
                    : 'Puedes mantener la fecha actual o ajustarla antes de publicar.'}
                </span>
              </div>
            </>
          ) : (
            <p className={styles.confirmText}>
              ¿Deseas pausar la venta pública de <strong>"{raffle.title}"</strong>?
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
            onClick={handleConfirmClick}
            disabled={!canSubmit}
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

