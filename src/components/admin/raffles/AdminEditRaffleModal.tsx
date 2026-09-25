import React, { useState } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { updateRaffleAdmin } from '@/services/raffleService';
import { COLOMBIAN_LOTTERIES, saveCachedRaffle } from '@/hooks/useActiveRaffle';
import {
  X,
  Sparkles,
  Save,
  Loader2,
  AlertTriangle,
  Info,
  DollarSign,
  Calendar,
  Award,
  Settings,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import styles from './AdminEditRaffleModal.module.css';

interface AdminEditRaffleModalProps {
  raffle: RaffleRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedRaffle: RaffleRow) => void;
}

const formatDateForInput = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
};

const EditRaffleForm: React.FC<{
  raffle: RaffleRow;
  onClose: () => void;
  onSuccess: (updatedRaffle: RaffleRow) => void;
}> = ({ raffle, onClose, onSuccess }) => {
  const [title, setTitle] = useState(raffle.title || '');
  const [description, setDescription] = useState(raffle.description || '');
  const [ticketPrice, setTicketPrice] = useState<number>(Number(raffle.ticket_price) || 25000);
  const [drawDate, setDrawDate] = useState<string>(formatDateForInput(raffle.draw_date));
  const [lotteryReference, setLotteryReference] = useState(raffle.lottery_reference || '');
  const [status, setStatus] = useState<'draft' | 'active' | 'paused' | 'closed' | 'finished'>(
    (raffle.status as 'draft' | 'active' | 'paused' | 'closed' | 'finished') || 'draft'
  );
  const [maxTicketsPerBuyer, setMaxTicketsPerBuyer] = useState<number>(
    raffle.max_tickets_per_buyer || 50
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    const cleanLottery = lotteryReference.trim();

    if (cleanTitle.length < 3) {
      setErrorMessage('El título de la rifa debe tener al menos 3 caracteres.');
      return;
    }

    if (cleanDesc.length < 10) {
      setErrorMessage('La descripción del premio debe ser detallada (mínimo 10 caracteres).');
      return;
    }

    if (!cleanLottery) {
      setErrorMessage('Por favor ingrese la lotería o mecanismo de referencia del sorteo.');
      return;
    }

    if (ticketPrice <= 0) {
      setErrorMessage('El precio por boleto debe ser mayor a 0 COP.');
      return;
    }

    if (!drawDate) {
      setErrorMessage('La fecha y hora del sorteo son obligatorias.');
      return;
    }

    if (maxTicketsPerBuyer <= 0) {
      setErrorMessage('El límite de boletos por comprador debe ser mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    const result = await updateRaffleAdmin({
      raffleId: raffle.id,
      title: cleanTitle,
      description: cleanDesc,
      ticketPrice,
      drawDate,
      lotteryReference: cleanLottery,
      status,
      maxTicketsPerBuyer,
    });
    setIsSubmitting(false);

    if (result.success && result.raffle) {
      saveCachedRaffle(result.raffle);
      onSuccess(result.raffle);
      onClose();
    } else {
      setErrorMessage(result.error || 'No fue posible actualizar los parámetros de la rifa.');
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => !isSubmitting && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado Fijo */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Editar Parámetros de la Rifa</h3>
              <span className={styles.headerSubtitle}>
                <span className={styles.headerMetaLabel}>Enlace</span> {raffle.slug} •
                Emisión: {raffle.total_tickets} boletos
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSubmitting}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario con Flex y Scrollbar Estilizada */}
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.modalBody}>
            {/* Banner de Error Explicativo y Amigable */}
            {errorMessage && (
              <div className={styles.errorBanner}>
                <AlertTriangle size={20} className={styles.errorBannerIcon} />
                <div className={styles.errorBannerContent}>
                  <strong className={styles.errorBannerTitle}>Atención con la Operación</strong>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Sección 1: Información General */}
            <div className={styles.sectionDivider}>
              <FileText size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Información General del Sorteo</span>
            </div>

            {/* Título de la Rifa */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Título Oficial del Sorteo *</label>
              <input
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Gran Rifa Ecoturística Manaure Vive"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Descripción / Experiencia */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Descripción del Premio / Experiencia *</label>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalla lo que incluye el premio mayor..."
                rows={3}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Sección 2: Parámetros Comerciales */}
            <div className={styles.sectionDivider}>
              <DollarSign size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Valores y Límite de Boletos</span>
            </div>

            {/* Fila: Precio y Máximo por Comprador */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <DollarSign size={14} />
                  Precio por Boleto (COP) *
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={ticketPrice}
                  onChange={(e) => setTicketPrice(Math.max(0, Number(e.target.value)))}
                  step={1000}
                  min={1000}
                  required
                  disabled={isSubmitting}
                />
                <span className={styles.helpText}>
                  Valor cobrado por cada boleto individual en la pasarela.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <ShieldCheck size={14} />
                  Límite por Comprador *
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={maxTicketsPerBuyer}
                  onChange={(e) => setMaxTicketsPerBuyer(Math.max(1, Number(e.target.value)))}
                  min={1}
                  max={200}
                  required
                  disabled={isSubmitting}
                />
                <span className={styles.helpText}>
                  Máximo de boletos por compra para prevenir acaparamientos.
                </span>
              </div>
            </div>

            {/* Sección 3: Sorteo y Lotería */}
            <div className={styles.sectionDivider}>
              <Calendar size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Fecha de Sorteo y Lotería</span>
            </div>

            {/* Fila: Fecha de Sorteo y Lotería */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <Calendar size={14} />
                  Fecha y Hora del Sorteo *
                </label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={drawDate}
                  onChange={(e) => setDrawDate(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <Award size={14} />
                  Lotería de Referencia *
                </label>
                <input
                  type="text"
                  list="colombianLotteriesListEdit"
                  className={styles.input}
                  value={lotteryReference}
                  onChange={(e) => setLotteryReference(e.target.value)}
                  placeholder="Ej. Lotería del Sinuano, Lotería de Santander..."
                  required
                  disabled={isSubmitting}
                />
                <datalist id="colombianLotteriesListEdit">
                  {COLOMBIAN_LOTTERIES.map((lot) => (
                    <option key={lot} value={lot} />
                  ))}
                </datalist>
                <div className={styles.lotteryChipsRow}>
                  {[
                    'Lotería del Sinuano',
                    'Lotería de Santander',
                    'Lotería de Boyacá',
                    'Lotería de Medellín',
                    'Lotería del Valle',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`${styles.lotteryPresetChip} ${
                        lotteryReference === preset ? styles.lotteryPresetChipActive : ''
                      }`}
                      onClick={() => setLotteryReference(preset)}
                      title={`Seleccionar ${preset}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sección 4: Estado Operativo */}
            <div className={styles.sectionDivider}>
              <Settings size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Estado Operativo del Sorteo</span>
            </div>

            {/* Estado del Sorteo */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Estado en el Portal Web *</label>
              <select
                className={styles.select}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'draft' | 'active' | 'paused' | 'closed' | 'finished')
                }
                disabled={isSubmitting}
              >
                <option value="active">🟢 Activa (Abierta para compras públicas)</option>
                <option value="paused">🟡 Pausada (Ventas temporalmente suspendidas)</option>
                <option value="draft">⚪ Borrador (Oculta al público)</option>
                <option value="finished">
                  🔵 Finalizada (Sorteo realizado / Ganador premiado)
                </option>
                <option value="closed">🔒 Cerrada (Ventas concluidas antes del sorteo)</option>
              </select>

              {status === 'active' && (
                <div className={`${styles.statusNotice} ${styles.statusNoticeActive}`}>
                  <Info size={16} className={styles.statusNoticeIcon} />
                  <span>
                    <strong>Sorteo Activo:</strong> La rifa está visible y los usuarios pueden
                    seleccionar boletos y pagar en tiempo real. Al activar esta rifa, cualquier otra
                    edición activa pasará automáticamente a estado pausado.
                  </span>
                </div>
              )}

              {status === 'paused' && (
                <div className={`${styles.statusNotice} ${styles.statusNoticePaused}`}>
                  <Info size={16} className={styles.statusNoticeIcon} />
                  <span>
                    <strong>Sorteo Pausado:</strong> La página pública mostrará un banner
                    aviso de pausa y bloqueará la selección de boletos y el pago.
                  </span>
                </div>
              )}

              {(status === 'closed' || status === 'finished') && (
                <div className={`${styles.statusNotice} ${styles.statusNoticeClosed}`}>
                  <Info size={16} className={styles.statusNoticeIcon} />
                  <span>
                    <strong>Sorteo Concluido:</strong> No se permitirán nuevas reservas ni compras.
                    Los boletos quedan preservados en el histórico.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Footer Fijo en la Parte Inferior (Siempre Visible) */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando Parámetros...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Guardar Parámetros</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminEditRaffleModal: React.FC<AdminEditRaffleModalProps> = ({
  raffle,
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !raffle) return null;
  return <EditRaffleForm key={raffle.id} raffle={raffle} onClose={onClose} onSuccess={onSuccess} />;
};
