import React, { useState, useEffect } from 'react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import {
  type OrderWithDetails,
  approveOrderPayment,
} from '@/services/paymentService';
import { sendPaymentApprovedEmail } from '@/services/emailService';
import {
  dispatchOrderNotifications,
  NOTIFICATION_EVENT_TYPES,
} from '@/services/notificationService';
import {
  CheckCircle2,
  X,
  AlertCircle,
  ShieldCheck,
  Mail,
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import styles from './AdminConfirmPaymentModal.module.css';

export interface AdminConfirmPaymentModalProps {
  isOpen: boolean;
  order: OrderWithDetails | null;
  isProcessing?: boolean;
  onConfirm?: () => void | Promise<void>;
  onSuccess?: (order: OrderWithDetails, emailSent: boolean) => void | Promise<void>;
  onClose: () => void;
}

type ApprovalPhase = 'idle' | 'approving' | 'sending_email' | 'success' | 'error';

export const AdminConfirmPaymentModal: React.FC<AdminConfirmPaymentModalProps> = ({
  isOpen,
  order,
  isProcessing = false,
  onConfirm,
  onSuccess,
  onClose,
}) => {
  const [phase, setPhase] = useState<ApprovalPhase>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailDelivered, setEmailDelivered] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setPhase('idle');
      setStatusMessage('');
      setErrorMessage(null);
      setEmailDelivered(false);
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

  if (!isOpen || !order) return null;

  const buyerName = order.buyers?.full_name || 'Comprador Desconocido';
  const buyerDoc = order.buyers?.document_id
    ? `C.C. ${order.buyers.document_id}`
    : 'Documento no registrado';
  const buyerPhone = order.buyers?.phone || 'Sin teléfono';
  const buyerEmail = order.buyers?.email?.trim();
  const tickets = order.tickets || [];
  const ticketCount = order.ticket_count || tickets.length;

  const hasEmail = Boolean(buyerEmail && buyerEmail.length > 0);
  const preference = (order.contact_preference || (hasEmail ? 'both' : 'whatsapp')).toLowerCase();
  const willSendEmail = hasEmail && (preference === 'email' || preference === 'both');

  const finishProcess = async (paidOrder: OrderWithDetails, emailOk: boolean) => {
    try {
      if (onSuccess) {
        await onSuccess(paidOrder, emailOk);
      } else if (onConfirm) {
        await onConfirm();
      }
    } finally {
      onClose();
    }
  };

  const handleExecuteApproval = async () => {
    if (!order || phase !== 'idle' || isProcessing) return;

    setErrorMessage(null);
    setPhase('approving');
    setStatusMessage('Confirmando boletos vendidos y actualizando estado en base de datos...');

    try {
      // 1. Aprobación financiera y de boletos en PostgreSQL
      const approveRes = await approveOrderPayment(order.id);

      if (!approveRes.success) {
        setPhase('error');
        setErrorMessage(approveRes.error || 'No se pudo aprobar el pago de la orden.');
        return;
      }

      // Estructura actualizada con estado 'paid' para los servicios dependientes
      const paidOrder: OrderWithDetails = {
        ...order,
        status: 'paid',
        verified_at: new Date().toISOString(),
      };

      // 2. Despacho de Correo Transaccional con Comprobante Oficial si aplica
      let emailOk = false;

      if (willSendEmail && buyerEmail) {
        setPhase('sending_email');
        setStatusMessage(`Generando comprobante digital oficial y enviando correo a ${buyerEmail}...`);

        try {
          const emailRes = await sendPaymentApprovedEmail(paidOrder);
          if (emailRes.success && !emailRes.skipped) {
            emailOk = true;
          } else if (emailRes.skipped) {
            console.log('[AdminConfirmPaymentModal] Despacho de correo omitido.');
          } else {
            console.warn('[AdminConfirmPaymentModal] Aviso de Brevo al enviar correo:', emailRes.error);
          }
        } catch (emailErr) {
          console.warn('[AdminConfirmPaymentModal] Error en sendPaymentApprovedEmail:', emailErr);
        }
      }

      setEmailDelivered(emailOk);

      // 3. Despachar notificaciones centralizadas y registrar log de auditoría
      try {
        const formattedTickets = (order.tickets || []).map((t) => formatTicketNumber(t.number));
        await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: (order.contact_preference || 'both') as any,
          eventType: NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED,
          skipEmail: true, // Ya despachado de forma segura con comprobante PNG
          notificationData: {
            reference: order.reference,
            buyerName: order.buyers?.full_name || 'Comprador',
            buyerPhone: order.buyers?.phone || '',
            buyerEmail: order.buyers?.email,
            ticketNumbers: formattedTickets,
            totalAmount: order.total_amount,
            verifyUrl:
              typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
          },
        });
      } catch (notifErr) {
        console.warn('[AdminConfirmPaymentModal] Error al registrar trazabilidad de notificación:', notifErr);
      }

      // 4. Fase de Éxito
      setPhase('success');
      if (emailOk && buyerEmail) {
        setStatusMessage(`¡Pago aprobado con éxito! Comprobante digital enviado a ${buyerEmail}.`);
      } else {
        setStatusMessage('¡Pago aprobado con éxito! Boletos confirmados definitivamente como vendidos.');
      }

      // 5. Finalización automática suave tras 1.4s
      setTimeout(() => {
        void finishProcess(paidOrder, emailOk);
      }, 1400);

    } catch (err: unknown) {
      setPhase('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Error inesperado al procesar la aprobación.'
      );
    }
  };

  const isWorking = phase === 'approving' || phase === 'sending_email';

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
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Confirmar Aprobación de Pago</h3>
              <span className={styles.headerSubtitle}>Orden #{order.reference}</span>
            </div>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isWorking || isProcessing}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.modalBody}>
          {/* Si está en fase de progreso (Aprobando o Enviando correo) */}
          {isWorking && (
            <>
              <div className={styles.loadingBanner}>
                <div className={styles.loadingIconWrapper}>
                  {phase === 'approving' ? (
                    <Loader2 size={30} className={styles.spinner} />
                  ) : (
                    <Mail size={30} className={styles.pulseMailIcon} />
                  )}
                </div>
                <div className={styles.loadingTextGroup}>
                  <h4 className={styles.loadingTitle}>
                    {phase === 'approving'
                      ? 'Confirmando Pago en el Sistema...'
                      : 'Enviando Comprobante Digital por Correo...'}
                  </h4>
                  <p className={styles.loadingSubtitle}>{statusMessage}</p>
                </div>
              </div>

              {/* Stepper de progreso */}
              <div className={styles.stepperRow}>
                <div
                  className={`${styles.stepItem} ${
                    phase === 'approving' ? styles.stepCurrent : styles.stepDone
                  }`}
                >
                  <div className={styles.stepBadge}>
                    {phase === 'approving' ? (
                      <Loader2 size={12} className={styles.spinner} />
                    ) : (
                      <Check size={12} />
                    )}
                  </div>
                  <span>1. Registro BD</span>
                </div>
                <div className={styles.stepLine} />
                <div
                  className={`${styles.stepItem} ${
                    phase === 'sending_email' ? styles.stepCurrent : styles.stepPending
                  }`}
                >
                  <div className={styles.stepBadge}>
                    {phase === 'sending_email' ? (
                      <Loader2 size={12} className={styles.spinner} />
                    ) : (
                      <Mail size={12} />
                    )}
                  </div>
                  <span>2. Envío de Correo</span>
                </div>
              </div>
            </>
          )}

          {/* Si está en fase de éxito */}
          {phase === 'success' && (
            <div className={styles.successBox}>
              <div className={styles.successIconWrapper}>
                <CheckCircle2 size={42} />
              </div>
              <h4 className={styles.successTitle}>¡Pago Aprobado con Éxito!</h4>
              <p className={styles.successMessage}>{statusMessage}</p>

              <div className={styles.successAuditCard}>
                <div className={styles.successAuditRow}>
                  <ShieldCheck size={16} className={styles.successAuditIcon} />
                  <span>Boletos asegurados como <strong>VENDIDOS</strong></span>
                </div>
                {emailDelivered && buyerEmail && (
                  <div className={styles.successAuditRow}>
                    <Mail size={16} className={styles.successAuditIcon} />
                    <span>
                      Comprobante digital enviado a <strong>{buyerEmail}</strong>
                    </span>
                  </div>
                )}
              </div>

              <span className={styles.autoFinalizeNotice}>
                Finalizando proceso de aceptación automáticamente...
              </span>
            </div>
          )}

          {/* Si hubo un error */}
          {phase === 'error' && (
            <div className={styles.errorBox}>
              <AlertTriangle size={24} className={styles.errorIcon} />
              <div className={styles.errorText}>
                <strong>No se pudo completar la aprobación:</strong>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Si está en estado inicial (o error), mostrar los detalles de la orden */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              {/* Tarjeta de Monto Destacado */}
              <div className={styles.amountBox}>
                <span className={styles.amountLabel}>Monto a Confirmar</span>
                <span className={styles.amountValue}>{formatCOP(order.total_amount)}</span>
              </div>

              {/* Datos del Comprador */}
              <div className={styles.detailsCard}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Comprador:</span>
                  <span className={styles.detailValue}>{buyerName}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Identificación:</span>
                  <span className={styles.detailValue}>{buyerDoc}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Contacto:</span>
                  <span className={styles.detailValue}>{buyerPhone}</span>
                </div>
                {buyerEmail && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Correo Electrónico:</span>
                    <span className={styles.detailValueEmail}>{buyerEmail}</span>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Cantidad de Boletos:</span>
                  <span className={styles.detailValue}>
                    {ticketCount} {ticketCount === 1 ? 'boleto' : 'boletos'}
                  </span>
                </div>
              </div>

              {/* Lista de Boletos a Confirmar */}
              {tickets.length > 0 && (
                <div className={styles.ticketsSection}>
                  <span className={styles.ticketsLabel}>Boletos que pasarán a VENDIDO:</span>
                  <div className={styles.ticketsList}>
                    {tickets.map((t) => (
                      <span key={t.id || t.number} className={styles.ticketChip}>
                        #{formatTicketNumber(t.number)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Nota de Seguridad */}
              <div className={styles.warningNotice}>
                <AlertCircle size={18} className={styles.warningIcon} />
                <div>
                  Al confirmar, los boletos se marcarán como <strong>VENDIDOS</strong> permanentemente,
                  se guardará el registro de seguridad en el sistema y se despachará automáticamente
                  el correo transaccional con el comprobante adjunto
                  {buyerEmail ? (
                    <> a <strong>{buyerEmail}</strong>.</>
                  ) : (
                    ' al comprador.'
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Botones de Acción */}
        <div className={styles.modalFooter}>
          {phase === 'success' ? (
            <button
              type="button"
              className={styles.btnConfirm}
              onClick={() => void finishProcess(order, emailDelivered)}
            >
              <Check size={16} />
              <span>Finalizar Ahora</span>
            </button>
          ) : isWorking ? (
            <button type="button" className={styles.btnConfirm} disabled>
              <Loader2 size={16} className={styles.spinner} />
              <span>
                {phase === 'approving' ? 'Aprobando Pago...' : 'Enviando Correo...'}
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
                className={styles.btnConfirm}
                onClick={() => void handleExecuteApproval()}
              >
                <CheckCircle2 size={16} />
                <span>Reintentar Aprobación</span>
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
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnConfirm}
                onClick={() => void handleExecuteApproval()}
                disabled={isProcessing}
              >
                <CheckCircle2 size={16} />
                <span>Sí, Aprobar Pago</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
