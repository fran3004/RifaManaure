import React, { useState } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { createRaffleAdmin } from '@/services/raffleService';
import {
  X,
  PlusCircle,
  Loader2,
  AlertTriangle,
  Info,
  DollarSign,
  Calendar,
  Award,
  Layers,
  FileText,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import styles from './AdminEditRaffleModal.module.css';

interface AdminCreateRaffleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newRaffle: RaffleRow) => void;
}

const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

const CreateRaffleForm: React.FC<{
  onClose: () => void;
  onSuccess: (newRaffle: RaffleRow) => void;
}> = ({ onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [ticketPrice, setTicketPrice] = useState<number>(25000);
  const [totalTickets, setTotalTickets] = useState<number>(1000);
  const [maxTicketsPerBuyer, setMaxTicketsPerBuyer] = useState<number>(50);
  const [drawDate, setDrawDate] = useState<string>('');
  const [lotteryReference, setLotteryReference] = useState(
    'Lotería de Santander (Premio Mayor de 3 cifras)'
  );
  const [status, setStatus] = useState<'draft' | 'active' | 'paused'>('draft');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (!slugManuallyEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanTitle = title.trim();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanDesc = description.trim();
    const cleanLottery = lotteryReference.trim();

    if (cleanTitle.length < 3) {
      setErrorMessage('El título de la rifa debe tener al menos 3 caracteres.');
      return;
    }

    if (!cleanSlug) {
      setErrorMessage('El slug o identificador URL es obligatorio.');
      return;
    }

    if (cleanDesc.length < 10) {
      setErrorMessage('La descripción del premio debe ser detallada (mínimo 10 caracteres).');
      return;
    }

    if (!cleanLottery) {
      setErrorMessage('La lotería o mecanismo de referencia es obligatoria.');
      return;
    }

    if (ticketPrice <= 0) {
      setErrorMessage('El precio por boleto debe ser mayor a 0 COP.');
      return;
    }

    if (!totalTickets || totalTickets <= 0) {
      setErrorMessage('La emisión total de boletos debe ser mayor a 0.');
      return;
    }

    if (maxTicketsPerBuyer <= 0) {
      setErrorMessage('El límite de boletos por comprador debe ser mayor a 0.');
      return;
    }

    if (!drawDate) {
      setErrorMessage('La fecha y hora del sorteo son obligatorias.');
      return;
    }

    setIsSubmitting(true);
    const result = await createRaffleAdmin({
      title: cleanTitle,
      slug: cleanSlug,
      description: cleanDesc,
      ticketPrice,
      totalTickets,
      maxTicketsPerBuyer,
      drawDate,
      lotteryReference: cleanLottery,
      status,
    });
    setIsSubmitting(false);

    if (result.success && result.raffle) {
      onSuccess(result.raffle);
      onClose();
    } else {
      setErrorMessage(result.error || 'No fue posible crear la nueva rifa en el servidor.');
    }
  };

  return (
    <div className={styles.backdrop} onClick={() => !isSubmitting && onClose()}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado Fijo */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <PlusCircle size={22} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Crear Nueva Edición de Rifa</h3>
              <span className={styles.headerSubtitle}>
                Configuración completa y emisión automática de boletos
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
            {errorMessage && (
              <div className={styles.errorBanner}>
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                <div className={styles.errorBannerContent}>
                  <strong className={styles.errorBannerTitle}>Atención con la Operación</strong>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Sección 1: Información General */}
            <div className={styles.sectionDivider}>
              <FileText size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Información del Sorteo</span>
            </div>

            {/* Título de la Rifa */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Título Oficial del Sorteo *</label>
              <input
                type="text"
                className={styles.input}
                value={title}
                onChange={handleTitleChange}
                placeholder="Ej. Gran Rifa Ecoturística - Segunda Edición 2026"
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Slug URL */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Identificador Slug (URL única) *</label>
              <input
                type="text"
                className={styles.input}
                value={slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="ej: segunda-edicion-manaure-2026"
                required
                disabled={isSubmitting}
              />
              <span className={styles.helpText}>
                Identificador URL limpio para el sistema. Se genera automáticamente a partir del
                título.
              </span>
            </div>

            {/* Descripción / Experiencia */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Descripción del Premio / Paquete *</label>
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

            {/* Sección 2: Emisión y Valores */}
            <div className={styles.sectionDivider}>
              <DollarSign size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Emisión y Precios</span>
            </div>

            {/* Fila: Total Boletos y Precio Unitario */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <Layers size={14} />
                  Emisión Total de Boletos *
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={totalTickets || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTotalTickets(val === '' ? 0 : parseInt(val, 10) || 0);
                  }}
                  step="1"
                  min="1"
                  placeholder="Ej. 1000"
                  required
                  disabled={isSubmitting}
                />
                <span className={styles.helpText}>
                  Ej. 1.000 generará automáticamente los números del 000 al 999.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <DollarSign size={14} />
                  Precio por Boleto (COP) *
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={ticketPrice || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTicketPrice(val === '' ? 0 : Math.max(0, Number(val)));
                  }}
                  step="any"
                  min="1"
                  placeholder="Ej. 25000"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Sección 3: Fecha y Sorteo */}
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
                  className={styles.input}
                  value={lotteryReference}
                  onChange={(e) => setLotteryReference(e.target.value)}
                  placeholder="Ej. Lotería de Santander (Premio Mayor 3 cifras)"
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Sección 4: Configuración Inicial */}
            <div className={styles.sectionDivider}>
              <Settings size={15} className={styles.sectionDividerIcon} />
              <span className={styles.sectionDividerText}>Límite y Estado Inicial</span>
            </div>

            {/* Fila: Límite por Comprador y Estado Inicial */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <ShieldCheck size={14} />
                  Límite Máximo por Comprador *
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={maxTicketsPerBuyer || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMaxTicketsPerBuyer(val === '' ? 0 : parseInt(val, 10) || 0);
                  }}
                  min={1}
                  placeholder="Ej. 50"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <Settings size={14} />
                  Estado Inicial del Sorteo *
                </label>
                <select
                  className={styles.select}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'active' | 'paused')}
                  disabled={isSubmitting}
                >
                  <option value="draft">⚪ Borrador (Configuración preliminar)</option>
                  <option value="active">🟢 Activa (Lanzar y abrir ventas inmediatamente)</option>
                  <option value="paused">🟡 Pausada (Lista pero con ventas cerradas)</option>
                </select>
              </div>
            </div>

            {status === 'active' && (
              <div className={`${styles.statusNotice} ${styles.statusNoticeActive}`}>
                <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <strong>Atención:</strong> Al crear esta rifa con estado Activa, cualquier otra
                  rifa que esté actualmente activa pasará automáticamente a estado Pausada.
                </span>
              </div>
            )}
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
                  <span>Creando Rifa y Generando Boletos...</span>
                </>
              ) : (
                <>
                  <PlusCircle size={16} />
                  <span>Crear y Generar Boletos</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminCreateRaffleModal: React.FC<AdminCreateRaffleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;
  return <CreateRaffleForm onClose={onClose} onSuccess={onSuccess} />;
};
