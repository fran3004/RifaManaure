import React, { useState, useRef } from 'react';
import {
  Trophy,
  X,
  Search,
  CheckCircle,
  AlertTriangle,
  UploadCloud,
  FileText,
  Loader2,
  Trash2,
  Lock,
  Calendar,
} from 'lucide-react';
import type { RaffleRow } from '@/types/raffle.types';
import {
  searchWinningTicketCandidate,
  registerWinner,
  uploadWinnerActDocument,
  type TicketWinnerCandidate,
} from '@/services/winnerService';
import { formatCOP } from '@/lib/utils';
import styles from './AdminRegisterWinnerModal.module.css';

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

const formatDateFriendly = (isoDate?: string | null): string => {
  if (!isoDate) return 'Sin fecha asignada';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Fecha inválida';
    return d.toLocaleDateString('es-CO', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
};

interface AdminRegisterWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWinnerRegistered: () => void;
  raffles: RaffleRow[];
  initialRaffleId?: string;
}

export const AdminRegisterWinnerModal: React.FC<AdminRegisterWinnerModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <AdminRegisterWinnerModalContent {...props} />;
};

const AdminRegisterWinnerModalContent: React.FC<AdminRegisterWinnerModalProps> = ({
  onClose,
  onWinnerRegistered,
  raffles,
  initialRaffleId,
}) => {
  const defaultRaffleId =
    initialRaffleId || raffles.find((r) => r.status === 'active')?.id || raffles[0]?.id || '';
  const [selectedRaffleId, setSelectedRaffleId] = useState<string>(defaultRaffleId);
  const selectedRaffle = raffles.find((r) => r.id === selectedRaffleId);
  const [lotteryDrawNumber, setLotteryDrawNumber] = useState<string>('');
  const [ticketNumber, setTicketNumber] = useState<string>('');

  const [candidate, setCandidate] = useState<TicketWinnerCandidate | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [isSearchingCandidate, setIsSearchingCandidate] = useState<boolean>(false);

  const [actFile, setActFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const actFileInputRef = useRef<HTMLInputElement>(null);

  // Buscar el boleto y verificar si está vendido
  const handleSearchCandidate = async () => {
    if (!selectedRaffleId) {
      setCandidateError('Por favor selecciona una rifa.');
      return;
    }
    if (!ticketNumber.trim()) {
      setCandidateError('Ingresa el número de boleto para verificar.');
      return;
    }

    setIsSearchingCandidate(true);
    setCandidateError(null);
    setCandidate(null);

    const result = await searchWinningTicketCandidate(selectedRaffleId, ticketNumber);

    if (result.success && result.candidate) {
      setCandidate(result.candidate);
    } else {
      setCandidateError(result.error || 'No se encontró el boleto.');
    }

    setIsSearchingCandidate(false);
  };

  const handleActFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setSubmitError('El acta oficial debe ser un documento PDF.');
        return;
      }
      setActFile(file);
      setSubmitError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedRaffleId) {
      setSubmitError('Selecciona la rifa del sorteo.');
      return;
    }

    if (!lotteryDrawNumber.trim()) {
      setSubmitError('Ingresa el número oficial ganador de la Lotería.');
      return;
    }

    if (!ticketNumber.trim()) {
      setSubmitError('Ingresa el número del boleto premiado.');
      return;
    }

    if (!candidate) {
      setSubmitError('Debes validar y encontrar el boleto vendido antes de registrar al ganador.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Subir acta si existe
      let officialActUrl: string | null = null;
      if (actFile) {
        const uploadActRes = await uploadWinnerActDocument(actFile, selectedRaffleId);
        if (!uploadActRes.success) {
          throw new Error(uploadActRes.error || 'Fallo al subir el acta PDF.');
        }
        officialActUrl = uploadActRes.url || null;
      }

      // 2. Invocar RPC administrativa register_winner con la fecha y hora oficial de la rifa seleccionada
      const officialDrawDate = selectedRaffle?.draw_date
        ? new Date(selectedRaffle.draw_date).toISOString()
        : new Date().toISOString();

      const regRes = await registerWinner({
        raffleId: selectedRaffleId,
        ticketNumber: candidate.ticketNumber,
        lotteryDrawNumber: lotteryDrawNumber.trim(),
        drawDate: officialDrawDate,
        officialActUrl,
        notes: notes.trim() || null,
      });

      if (!regRes.success) {
        throw new Error(regRes.error || 'Error al registrar ganador en la base de datos.');
      }

      onWinnerRegistered();
      onClose();
    } catch (err) {
      console.error('Error al registrar ganador:', err);
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado al registrar ganador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        {/* Cabecera */}
        <div className={styles.modalHeader}>
          <div className={styles.headerInfo}>
            <div className={styles.headerIcon}>
              <Trophy size={24} />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Registrar Ganador Oficial</h3>
              <p className={styles.modalSubtitle}>
                Valida el boleto vendido, asocia el sorteo de lotería y adjunta evidencias.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.modalBody}>
            {/* Mensaje de error general si ocurre */}
            {submitError && (
              <div className={styles.alertBanner}>
                <AlertTriangle size={20} className={styles.alertBannerIcon} />
                <span>{submitError}</span>
              </div>
            )}

            {/* SECCIÓN 1: Rifa y Lotería */}
            <div className={styles.sectionGroup}>
              <h4 className={styles.sectionTitle}>
                <Trophy size={16} /> 1. Datos del Sorteo Oficial
              </h4>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Rifa o Edición *</label>
                <select
                  value={selectedRaffleId}
                  onChange={(e) => {
                    setSelectedRaffleId(e.target.value);
                    setCandidate(null);
                    setCandidateError(null);
                  }}
                  className={styles.selectField}
                  required
                >
                  {raffles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.lottery_reference || 'Sorteo Oficial'}) - Estado: {r.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGrid2}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Número Oficial {selectedRaffle?.lottery_reference ? `(${selectedRaffle.lottery_reference})` : 'de la Lotería'} *
                  </label>
                  <input
                    type="text"
                    value={lotteryDrawNumber}
                    onChange={(e) => setLotteryDrawNumber(e.target.value)}
                    placeholder="Ej. 7482"
                    className={styles.inputField}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <label className={styles.formLabel}>Fecha y Hora del Sorteo *</label>
                    <span className={styles.badgeLocked}>
                      <Lock size={11} aria-hidden="true" />
                      Oficial de la Rifa
                    </span>
                  </div>
                  <input
                    type="datetime-local"
                    value={formatDateForInput(selectedRaffle?.draw_date)}
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    className={`${styles.inputField} ${styles.inputLocked}`}
                    title="Esta fecha y hora no se puede cambiar manualmente; reconoce automáticamente la fecha y hora que el administrador asignó a esta rifa."
                    required
                  />
                  {selectedRaffle?.draw_date ? (
                    <span className={styles.fieldHintLocked}>
                      <Calendar size={12} aria-hidden="true" />
                      Configurada en la rifa: {formatDateFriendly(selectedRaffle.draw_date)}
                    </span>
                  ) : (
                    <span
                      className={styles.fieldHintLocked}
                      style={{ color: 'var(--color-danger, #B42318)' }}
                    >
                      <AlertTriangle size={12} aria-hidden="true" />
                      La rifa seleccionada no tiene una fecha oficial asignada.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: Boleto Ganador y Validación Automática */}
            <div className={styles.sectionGroup}>
              <h4 className={styles.sectionTitle}>
                <Search size={16} /> 2. Verificación de Boleto Premiado
              </h4>

              <div className={styles.searchTicketRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Número del Boleto Premiado (000 - 999) *
                  </label>
                  <input
                    type="text"
                    value={ticketNumber}
                    onChange={(e) => {
                      setTicketNumber(e.target.value);
                      if (candidate) setCandidate(null);
                    }}
                    placeholder="Ej. 045 o 482"
                    maxLength={4}
                    className={styles.inputField}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchCandidate();
                      }
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSearchCandidate}
                  disabled={isSearchingCandidate || !ticketNumber.trim()}
                  className={styles.btnVerify}
                >
                  {isSearchingCandidate ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  <span>Buscar y Validar</span>
                </button>
              </div>

              {/* Error al buscar candidato */}
              {candidateError && (
                <div className={styles.alertBanner}>
                  <AlertTriangle size={18} className={styles.alertBannerIcon} />
                  <span>{candidateError}</span>
                </div>
              )}

              {/* Tarjeta de Ganador Validado */}
              {candidate && (
                <div className={styles.candidateCard}>
                  <div className={styles.candidateHeader}>
                    <div className={styles.candidateBadge}>
                      <CheckCircle size={15} />
                      <span>Boleto Pagado y Validado</span>
                    </div>
                    <span className={styles.ticketBadgeHero}>#{candidate.ticketNumber}</span>
                  </div>

                  <div className={styles.candidateGrid}>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Ganador</span>
                      <span className={styles.candidateItemValue}>{candidate.buyerName}</span>
                    </div>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Cédula / Documento</span>
                      <span className={styles.candidateItemValue}>{candidate.buyerDocument}</span>
                    </div>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Celular</span>
                      <span className={styles.candidateItemValue}>{candidate.buyerPhone}</span>
                    </div>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Ciudad</span>
                      <span className={styles.candidateItemValue}>{candidate.buyerCity}</span>
                    </div>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Orden de Compra</span>
                      <span className={styles.candidateItemValue}>{candidate.orderReference}</span>
                    </div>
                    <div className={styles.candidateItem}>
                      <span className={styles.candidateItemLabel}>Valor Total Pagado</span>
                      <span className={styles.candidateItemValue}>
                        {formatCOP(candidate.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN 3: Evidencias Oficiales (Acta y Fotos) */}
            <div className={styles.sectionGroup}>
              <h4 className={styles.sectionTitle}>
                <UploadCloud size={16} /> 3. Evidencias del Sorteo y Entrega
              </h4>

              {/* Subir Acta Oficial en PDF */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Acta Oficial del Sorteo (PDF)</label>
                <input
                  type="file"
                  ref={actFileInputRef}
                  onChange={handleActFileChange}
                  accept="application/pdf"
                  className={styles.hiddenInput}
                />

                {actFile ? (
                  <div className={styles.filePreviewCard}>
                    <div className={styles.filePreviewInfo}>
                      <FileText size={20} color="var(--color-success)" />
                      <span className={styles.fileName}>{actFile.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActFile(null)}
                      className={styles.removeFileBtn}
                      title="Quitar archivo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    className={styles.uploadDropzone}
                    onClick={() => actFileInputRef.current?.click()}
                  >
                    <FileText size={28} color="#94a3b8" />
                    <span className={styles.uploadText}>
                      Haz clic para subir el Acta Oficial en PDF
                    </span>
                    <span className={styles.uploadSubtext}>
                      Documento firmado y sellado de la adjudicación del premio (máx. 10 MB).
                    </span>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Observaciones o Notas de Entrega</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles sobre la entrega, lugar en Manaure, o comentarios del acta..."
                  rows={2}
                  className={styles.textareaField}
                />
              </div>
            </div>
          </div>

          {/* Footer de Acciones */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={styles.btnSecondary}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !candidate}
              className={styles.btnPrimary}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <Trophy size={16} />
                  <span>Confirmar y Registrar Ganador</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
