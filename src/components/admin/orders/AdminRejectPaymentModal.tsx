import React, { useState, useEffect, useMemo } from 'react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import {
  type OrderWithDetails,
  rejectOrderPayment,
} from '@/services/paymentService';
import { sendPaymentRejectedEmail, shouldSendEmail } from '@/services/emailService';
import {
  dispatchOrderNotifications,
  NOTIFICATION_EVENT_TYPES,
  buildPaymentRejectedMessage,
  recordWhatsAppOpened,
  REJECTION_REASONS_CATALOG,
  formatRejectionReason,
  type RejectionReasonItem,
} from '@/services/notificationService';
import { createWhatsAppLink } from '@/services/whatsappService';
import {
  XCircle,
  X,
  AlertCircle,
  AlertTriangle,
  Mail,
  Loader2,
  Check,
  MessageSquare,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import styles from './AdminRejectPaymentModal.module.css';

export interface AdminRejectPaymentModalProps {
  isOpen: boolean;
  order: OrderWithDetails | null;
  isProcessing?: boolean;
  onSuccess?: (
    order: OrderWithDetails,
    emailSent: boolean,
    reason: string
  ) => void | Promise<void>;
  onClose: () => void;
}

type RejectionPhase = 'idle' | 'rejecting' | 'sending_email' | 'success' | 'error';

export const AdminRejectPaymentModal: React.FC<AdminRejectPaymentModalProps> = ({
  isOpen,
  order,
  isProcessing = false,
  onSuccess,
  onClose,
}) => {
  const [phase, setPhase] = useState<RejectionPhase>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState<boolean>(false);
  const [rejectedOrder, setRejectedOrder] = useState<OrderWithDetails | null>(null);

  // Estados del motivo de rechazo estructurado
  const [selectedPreset, setSelectedPreset] = useState<RejectionReasonItem>(
    REJECTION_REASONS_CATALOG[0]
  );
  const [customReason, setCustomReason] = useState<string>('');

  // Estados interactivos para WhatsApp
  const [copiedWhatsApp, setCopiedWhatsApp] = useState<boolean>(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState<boolean>(false);
  const [showLivePreview, setShowLivePreview] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setPhase('idle');
      setStatusMessage('');
      setErrorMessage(null);
      setEmailDelivered(false);
      setRejectedOrder(null);
      setSelectedPreset(REJECTION_REASONS_CATALOG[0]);
      setCustomReason('');
      setCopiedWhatsApp(false);
      setShowWhatsAppPreview(false);
      setShowLivePreview(false);
    }
  }, [isOpen, order?.id]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'idle' && !isProcessing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, phase, isProcessing, onClose]);

  // ── HOOKS ── Siempre antes del early return para cumplir las Reglas de Hooks ──
  // Estos useMemo deben ejecutarse en TODOS los renders, incluso cuando el modal
  // está cerrado. El early return va DESPUÉS de todos los hooks.
  const finalReason = useMemo(() => {
    return formatRejectionReason(selectedPreset, customReason);
  }, [selectedPreset, customReason]);

  const whatsAppText = useMemo(() => {
    if (!order) return '';
    const bName = order.buyers?.full_name || 'Comprador Desconocido';
    const bPhone = order.buyers?.phone || 'Sin teléfono';
    const bEmail = order.buyers?.email?.trim();
    const tks = (order.tickets || []).map((t) => formatTicketNumber(t.number));
    const raf = (order as any)?.raffle || (order as any)?.raffles;
    return buildPaymentRejectedMessage({
      reference: order.reference,
      buyerName: bName,
      buyerPhone: bPhone,
      buyerEmail: bEmail,
      ticketNumbers: tks,
      totalAmount: order.total_amount,
      raffleTitle: raf?.title,
      supportPhone: raf?.support_phone,
      rejectionReason: finalReason,
      verifyUrl:
        typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
    });
  }, [order, finalReason]);
  // ─────────────────────────────────────────────────────────────────────────────

  if (!isOpen || !order) return null;

  const buyerName = order.buyers?.full_name || 'Comprador Desconocido';
  const buyerPhone = order.buyers?.phone || 'Sin teléfono';
  const buyerEmail = order.buyers?.email?.trim();
  const tickets = order.tickets || [];
  const ticketCount = tickets.length || order.ticket_count || 0;
  const formattedTickets = tickets.map((t) => formatTicketNumber(t.number));


  const hasValidPhone = Boolean(
    buyerPhone &&
      buyerPhone.trim().length >= 7 &&
      buyerPhone !== 'Sin teléfono' &&
      !buyerPhone.toLowerCase().includes('sin')
  );

  const whatsAppLink = hasValidPhone ? createWhatsAppLink(buyerPhone, whatsAppText) : '';

  const handleOpenWhatsApp = () => {
    if (!order || !whatsAppLink) return;
    window.open(whatsAppLink, '_blank', 'noopener,noreferrer');
    if (buyerPhone) {
      void recordWhatsAppOpened(
        order.id,
        NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED,
        buyerPhone
      );
    }
  };

  const handleCopyWhatsApp = () => {
    if (!whatsAppText) return;
    void navigator.clipboard.writeText(whatsAppText);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  };

  const finishProcess = async (targetOrder: OrderWithDetails, emailOk: boolean) => {
    try {
      if (onSuccess) {
        await onSuccess(targetOrder, emailOk, finalReason);
      }
    } finally {
      onClose();
    }
  };

  const handleExecuteRejection = async () => {
    if (phase !== 'idle' || isProcessing) return;

    setErrorMessage(null);
    setPhase('rejecting');
    setStatusMessage('Liberando boletos y actualizando orden a estado rechazado...');

    try {
      // 1. Ejecutar RPC de rechazo y liberación de boletos en PostgreSQL
      const rejectRes = await rejectOrderPayment(order.id, finalReason);

      if (!rejectRes.success) {
        setPhase('error');
        setErrorMessage(rejectRes.error || 'No se pudo rechazar la orden en el sistema.');
        return;
      }

      const updatedOrder: OrderWithDetails = {
        ...order,
        status: 'rejected',
        rejection_reason: finalReason,
      };
      setRejectedOrder(updatedOrder);

      // 2. Despacho de Correo Transaccional de Rechazo si aplica
      let emailOk = false;
      const canSendMail = shouldSendEmail(order.contact_preference) && Boolean(buyerEmail);

      if (canSendMail && buyerEmail) {
        setPhase('sending_email');
        setStatusMessage(`Enviando notificación formal de rechazo a ${buyerEmail}...`);

        try {
          const emailRes = await sendPaymentRejectedEmail(
            order.id,
            order.contact_preference,
            { ticketNumbers: formattedTickets }
          );
          if (emailRes.success && !emailRes.skipped) {
            emailOk = true;
          } else {
            console.warn('[AdminRejectPaymentModal] Correo de rechazo no despachado:', emailRes.error);
          }
        } catch (emailErr) {
          console.warn('[AdminRejectPaymentModal] Error en sendPaymentRejectedEmail:', emailErr);
        }
      }

      setEmailDelivered(emailOk);

      // 3. Registrar trazabilidad de notificación en Supabase
      try {
        await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: (order.contact_preference || 'both') as any,
          eventType: NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED,
          skipEmail: true,
          notificationData: {
            reference: order.reference,
            buyerName,
            buyerPhone: order.buyers?.phone || '',
            buyerEmail: order.buyers?.email,
            ticketNumbers: formattedTickets,
            totalAmount: order.total_amount,
            rejectionReason: finalReason,
            verifyUrl:
              typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
          },
        });
      } catch (notifErr) {
        console.warn('[AdminRejectPaymentModal] Error al registrar log de notificación:', notifErr);
      }

      // 4. Fase de Éxito guiada
      setPhase('success');
      if (emailOk && buyerEmail) {
        setStatusMessage(
          `¡Orden rechazada y boletos liberados! Se despachó el correo explicativo a ${buyerEmail}.`
        );
      } else {
        setStatusMessage(
          '¡Orden rechazada y boletos liberados! Los números quedaron disponibles para la venta.'
        );
      }

    } catch (err: unknown) {
      setPhase('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Error inesperado al rechazar la orden.'
      );
    }
  };

  const isWorking = phase === 'rejecting' || phase === 'sending_email';

  return (
    <div
      className={styles.backdrop}
      onClick={() => {
        if (!isWorking && phase !== 'success') onClose();
      }}
    >
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <XCircle size={22} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Rechazar Pago de Orden</h3>
              <span className={styles.headerSubtitle}>Orden #{order.reference}</span>
            </div>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isWorking}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.modalBody}>
          {/* Pantalla de Progreso */}
          {isWorking && (
            <div className={styles.loadingBanner}>
              <div className={styles.loadingIconWrapper}>
                {phase === 'rejecting' ? (
                  <Loader2 size={28} className={styles.spinner} />
                ) : (
                  <Mail size={28} className={styles.spinner} />
                )}
              </div>
              <div className={styles.loadingTextGroup}>
                <h4 className={styles.loadingTitle}>
                  {phase === 'rejecting'
                    ? 'Liberando Boletos en el Sistema...'
                    : 'Enviando Correo de Rechazo...'}
                </h4>
                <p className={styles.loadingSubtitle}>{statusMessage}</p>
              </div>
            </div>
          )}

          {/* Pantalla de Éxito con Tarjeta Destacada de WhatsApp */}
          {phase === 'success' && (
            <div className={styles.successBox}>
              <div className={styles.successIconWrapper}>
                <XCircle size={40} />
              </div>
              <h4 className={styles.successTitle}>Orden Rechazada y Boletos Liberados</h4>
              <p className={styles.successMessage}>{statusMessage}</p>

              <div className={styles.successAuditCard}>
                <div className={styles.successAuditRow}>
                  <AlertTriangle size={15} className={styles.successAuditIcon} />
                  <span>
                    {ticketCount} {ticketCount === 1 ? 'boleto liberado' : 'boletos liberados'} para venta pública
                  </span>
                </div>
                {emailDelivered && buyerEmail ? (
                  <div className={styles.successAuditRow}>
                    <Mail size={15} className={styles.successAuditIcon} />
                    <span>
                      Correo de no aprobación enviado a <strong>{buyerEmail}</strong>
                    </span>
                  </div>
                ) : (
                  <div className={styles.successAuditRow}>
                    <Mail size={15} className={styles.successAuditIcon} />
                    <span>
                      Correo transaccional: <strong>{buyerEmail ? 'No despachado' : 'No registrado'}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Tarjeta Destacada de WhatsApp Post-Rechazo */}
              {hasValidPhone ? (
                <div className={styles.whatsappActionCard}>
                  <div className={styles.whatsappCardHeader}>
                    <div className={styles.whatsappHeaderLeft}>
                      <div className={styles.whatsappIconCircle}>
                        <MessageSquare size={18} />
                      </div>
                      <div className={styles.whatsappTitleGroup}>
                        <span className={styles.whatsappTitle}>Enviar Notificación por WhatsApp</span>
                        <span className={styles.whatsappSubtitle}>Mensaje con motivo y boletos liberados listo</span>
                      </div>
                    </div>
                    <span className={styles.whatsappRecipientBadge}>
                      {buyerPhone}
                    </span>
                  </div>

                  <div className={styles.whatsappActionsRow}>
                    <button
                      type="button"
                      className={styles.btnWhatsAppPrimary}
                      onClick={handleOpenWhatsApp}
                      title="Abrir WhatsApp Web o Móvil con la explicación estructurada"
                    >
                      <ExternalLink size={15} />
                      <span>Abrir WhatsApp y Enviar Explicación</span>
                    </button>

                    <button
                      type="button"
                      className={styles.btnCopyText}
                      onClick={handleCopyWhatsApp}
                      title="Copiar texto oficial al portapapeles"
                    >
                      {copiedWhatsApp ? (
                        <Check size={14} color="var(--admin-success, #10b981)" />
                      ) : (
                        <Copy size={14} />
                      )}
                      <span>{copiedWhatsApp ? '¡Copiado!' : 'Copiar Texto'}</span>
                    </button>

                    <button
                      type="button"
                      className={styles.btnTogglePreview}
                      onClick={() => setShowWhatsAppPreview((prev) => !prev)}
                    >
                      {showWhatsAppPreview ? 'Ocultar plantilla' : 'Ver plantilla del mensaje'}
                    </button>
                  </div>

                  {showWhatsAppPreview && (
                    <pre className={styles.whatsappMessagePreview}>{whatsAppText}</pre>
                  )}
                </div>
              ) : (
                <div className={styles.ticketsAlertCard}>
                  <div className={styles.ticketsAlertHeader}>
                    <AlertCircle size={15} />
                    <span>Comprador sin número de WhatsApp registrado.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pantalla de Error */}
          {phase === 'error' && (
            <div className={styles.errorBox}>
              <AlertTriangle size={24} className={styles.errorIcon} />
              <div className={styles.errorText}>
                <strong>No se pudo rechazar la orden:</strong>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Formulario de Selección de Motivo (fases idle o error) */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              {/* Alerta de Boletos a Liberar */}
              <div className={styles.ticketsAlertCard}>
                <div className={styles.ticketsAlertHeader}>
                  <AlertTriangle size={15} />
                  <span>
                    Al confirmar, se liberarán {ticketCount} {ticketCount === 1 ? 'boleto' : 'boletos'} ({formatCOP(order.total_amount)})
                  </span>
                </div>
                {formattedTickets.length > 0 && (
                  <div className={styles.ticketsBadgeList}>
                    {formattedTickets.map((num) => (
                      <span key={num} className={styles.ticketBadge}>
                        #{num}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Selector de Motivos Estructurados */}
              <div className={styles.reasonSection}>
                <span className={styles.sectionLabel}>
                  <AlertCircle size={15} />
                  Selecciona el motivo de no aprobación:
                </span>

                <div className={styles.reasonChipsGrid}>
                  {REJECTION_REASONS_CATALOG.map((item) => {
                    const isSelected = selectedPreset.id === item.id;
                    return (
                      <label
                        key={item.id}
                        className={`${styles.reasonChip} ${
                          isSelected ? styles.reasonChipSelected : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="rejectionReasonPreset"
                          checked={isSelected}
                          onChange={() => setSelectedPreset(item)}
                          className={styles.reasonChipRadio}
                        />
                        <div className={styles.reasonChipContent}>
                          <span className={styles.reasonChipTitle}>{item.label}</span>
                          <span className={styles.reasonChipDesc}>
                            {item.defaultExplanation}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Observación o Detalle Adicional */}
              <div className={styles.notesGroup}>
                <label htmlFor="rejectionNotes" className={styles.sectionLabel}>
                  Detalle adicional para el comprador (opcional):
                </label>
                <textarea
                  id="rejectionNotes"
                  className={styles.notesTextarea}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ej: El comprobante no muestra el número de cuenta de destino o el valor consignado es de $30.000 en vez de $75.000..."
                  maxLength={300}
                />
                <span className={styles.notesCounter}>
                  {customReason.length}/300 caracteres
                </span>
              </div>

              {/* Vista previa en vivo del mensaje de WhatsApp */}
              <div className={styles.previewSection}>
                <button
                  type="button"
                  className={styles.previewToggleBtn}
                  onClick={() => setShowLivePreview((prev) => !prev)}
                >
                  {showLivePreview ? (
                    <>
                      <ChevronUp size={14} />
                      <span>Ocultar vista previa de notificación</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      <span>Previsualizar mensaje de notificación (WhatsApp / Correo)</span>
                    </>
                  )}
                </button>

                {showLivePreview && (
                  <pre className={styles.previewBox}>{whatsAppText}</pre>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer de Acciones */}
        <div className={styles.modalFooter}>
          {phase === 'success' ? (
            <button
              type="button"
              className={styles.btnFinishProcess}
              onClick={() => void finishProcess(rejectedOrder || order, emailDelivered)}
            >
              <Check size={16} />
              <span>Finalizar y Volver</span>
            </button>
          ) : isWorking ? (
            <button type="button" className={styles.btnReject} disabled>
              <Loader2 size={16} className={styles.spinner} />
              <span>
                {phase === 'rejecting' ? 'Rechazando Orden...' : 'Enviando Correo...'}
              </span>
            </button>
          ) : phase === 'error' ? (
            <>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnReject}
                onClick={() => void handleExecuteRejection()}
              >
                <XCircle size={16} />
                <span>Reintentar Rechazo</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={onClose}
                disabled={isProcessing}
              >
                Volver
              </button>
              <button
                type="button"
                className={styles.btnReject}
                onClick={() => void handleExecuteRejection()}
                disabled={isProcessing}
              >
                <XCircle size={16} />
                <span>Confirmar Rechazo y Liberar Boletos</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

