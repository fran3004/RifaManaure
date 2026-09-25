import React, { useState, useEffect } from 'react';
import {
  type OrderWithDetails,
  approveOrderPayment,
  rejectOrderPayment,
  getSignedProofUrl,
} from '@/services/paymentService';
import { formatCOP, formatTicketNumber, maskDocumentId } from '@/lib/utils';
import {
  dispatchOrderNotifications,
  getOrderNotificationLogs,
  generateOrderNotification,
  retryNotification,
  NOTIFICATION_EVENT_TYPES,
  type GeneratedNotification,
  type NotificationLogRow,
} from '@/services/notificationService';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Ticket,
  CreditCard,
  FileText,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Phone,
  Mail,
  Calendar,
  Hash,
  Send,
  AlertCircle,
  Download,
} from 'lucide-react';
import { DigitalReceiptModal } from '@/components/receipt/DigitalReceiptModal';
import { AdminConfirmPaymentModal } from './AdminConfirmPaymentModal';
import {
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
  shouldSendEmail,
  buildDigitalReceiptDataFromOrder,
  convertCanvasToBase64,
  formatReceiptAttachmentFileName,
} from '@/services/emailService';
import { generateDigitalReceiptCanvas } from '@/services/receiptGeneratorService';
import styles from './AdminOrderReviewModal.module.css';

interface AdminOrderReviewModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void | Promise<void>;
}

const REJECTION_PRESETS = [
  'Comprobante ilegible o borroso',
  'Valor incorrecto o incompleto',
  'Transferencia no identificada en cuenta bancaria',
  'Datos inconsistentes / no coinciden con el comprador',
  'Comprobante duplicado o reutilizado',
  'Otro motivo',
];

function formatNotificationEventLabel(eventType?: string): string {
  if (!eventType) return 'Notificación';
  const clean = eventType.toLowerCase();
  if (clean.includes('approved')) return 'Pago Aprobado';
  if (clean.includes('rejected')) return 'Pago Rechazado';
  return 'Comprobante Recibido';
}

export const AdminOrderReviewModal: React.FC<AdminOrderReviewModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
}) => {
  // Estados de comprobante seguro
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState<boolean>(false);
  const [proofError, setProofError] = useState<string | null>(null);

  // Estados de acciones
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modo de rechazo
  const [showRejectionForm, setShowRejectionForm] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<string>(REJECTION_PRESETS[0]);
  const [customReason, setCustomReason] = useState<string>('');

  // Notificación generada
  const [preparedNotification, setPreparedNotification] = useState<GeneratedNotification | null>(
    null
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Trazabilidad de notificaciones (WhatsApp y Email)
  const [notificationLogs, setNotificationLogs] = useState<NotificationLogRow[]>([]);
  const [isRetryingNotif, setIsRetryingNotif] = useState<boolean>(false);
  const [notifActionResult, setNotifActionResult] = useState<string | null>(null);

  // Comprobante digital
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  // Cargar trazabilidad de notificaciones y URL segura firmada cuando cambia la orden
  useEffect(() => {
    let active = true;

    if (isOpen && order?.id) {
      void getOrderNotificationLogs(order.id).then((logs) => {
        if (active) setNotificationLogs(logs);
      });
    }

    const fetchSignedUrl = async () => {
      if (!isOpen || !order?.receipt_url) {
        if (active) {
          setSignedProofUrl(null);
          setIsLoadingProof(false);
          setProofError(null);
        }
        return;
      }

      setIsLoadingProof(true);
      setProofError(null);
      try {
        const res = await getSignedProofUrl(order.receipt_url, 900); // 15 min
        if (active) {
          if (res.url) {
            setSignedProofUrl(res.url);
          } else {
            setProofError(res.error || 'No se pudo generar el enlace seguro al comprobante.');
          }
        }
      } catch (err) {
        if (active) {
          setProofError(err instanceof Error ? err.message : 'Error al cargar comprobante.');
        }
      } finally {
        if (active) {
          setIsLoadingProof(false);
        }
      }
    };

    void fetchSignedUrl();

    return () => {
      active = false;
    };
  }, [isOpen, order?.id, order?.receipt_url]);

  if (!isOpen || !order) return null;

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasReceipt = Boolean(order.receipt_url && order.receipt_url.trim().length > 0);
  const canReviewPayment = order.status === 'pending_verification' && hasReceipt;
  const isPendingAction = canReviewPayment;

  const dateStr = new Date(order.created_at).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formattedTickets = (order.tickets || []).map((t) => formatTicketNumber(t.number));
  const isPdf =
    order.receipt_url?.toLowerCase().endsWith('.pdf') ||
    order.receipt_url?.toLowerCase().includes('.pdf?') ||
    signedProofUrl?.toLowerCase().includes('.pdf');

  // APROBAR PAGO
  const handleApprove = async () => {
    if (!order || !canReviewPayment) return;

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await approveOrderPayment(order.id);

      if (res.success) {
        setIsConfirmApproveOpen(false);
        setActionSuccess(
          `¡Pago aprobado! Se confirmaron definitivamente ${order.ticket_count} boletos como vendidos.`
        );

        // 1. Despacho de Correo Transaccional con Comprobante PNG adjunto si aplica
        if (shouldSendEmail(order.contact_preference)) {
          try {
            const emailRes = await sendPaymentApprovedEmail(order);
            if (!emailRes.success) {
              console.warn(
                'Aviso: El correo de confirmación no pudo ser entregado:',
                emailRes.error
              );
            }
          } catch (emailErr) {
            console.warn('Error al procesar correo de confirmación de pago:', emailErr);
          }
        }

        // 2. Despachar notificaciones centralizadas según contactPreference de la orden
        const dispatchResult = await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: order.contact_preference || 'both',
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

        // Actualizar historial completo de trazabilidad en tiempo real
        void getOrderNotificationLogs(order.id).then(setNotificationLogs);

        // Asignar plantilla de WhatsApp si aplica o como soporte para el administrador
        if (dispatchResult.whatsappNotification) {
          setPreparedNotification(dispatchResult.whatsappNotification);
        }

        await onOrderUpdated();
      } else {
        setActionError(res.error || 'No se pudo aprobar el pago de la orden.');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error inesperado al aprobar pago.');
    } finally {
      setIsProcessing(false);
    }
  };

  // RECHAZAR PAGO
  const handleReject = async () => {
    if (!order || !canReviewPayment) return;

    const finalReason =
      selectedPreset === 'Otro motivo'
        ? customReason.trim()
        : `${selectedPreset}${customReason.trim() ? `: ${customReason.trim()}` : ''}`;

    if (!finalReason) {
      setActionError('Es obligatorio indicar el motivo del rechazo.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await rejectOrderPayment(order.id, finalReason);

      if (res.success) {
        setActionSuccess(
          `Orden rechazada exitosamente. Los ${order.ticket_count} boletos fueron liberados inmediatamente a disponibles.`
        );

        // 1. Despachar correo transaccional de rechazo si aplica
        if (shouldSendEmail(order.contact_preference)) {
          try {
            const emailRes = await sendPaymentRejectedEmail(order.id, order.contact_preference);
            if (!emailRes.success) {
              console.warn('Aviso: Falló el despacho de correo de rechazo:', emailRes.error);
            }
          } catch (emailErr) {
            console.warn('Error al procesar correo de rechazo:', emailErr);
          }
        }

        // 2. Despachar notificaciones centralizadas por WhatsApp
        const dispatchResult = await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: order.contact_preference || 'both',
          eventType: NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED,
          skipEmail: true, // Ya despachado arriba
          notificationData: {
            reference: order.reference,
            buyerName: order.buyers?.full_name || 'Comprador',
            buyerPhone: order.buyers?.phone || '',
            buyerEmail: order.buyers?.email,
            ticketNumbers: formattedTickets,
            totalAmount: order.total_amount,
            rejectionReason: finalReason,
            verifyUrl:
              typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
          },
        });

        // Actualizar historial completo de trazabilidad en tiempo real
        void getOrderNotificationLogs(order.id).then(setNotificationLogs);

        // Asignar plantilla de WhatsApp si aplica o como soporte para el administrador
        if (dispatchResult.whatsappNotification) {
          setPreparedNotification(dispatchResult.whatsappNotification);
        }

        await onOrderUpdated();
      } else {
        setActionError(res.error || 'No se pudo rechazar la orden.');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error inesperado al rechazar orden.');
    } finally {
      setIsProcessing(false);
    }
  };

  // REINTENTAR NOTIFICACIÓN (WHATSAPP)
  const handleRetryWhatsAppNotification = async (log?: NotificationLogRow) => {
    if (!order) return;
    setIsRetryingNotif(true);
    setNotifActionResult(null);
    try {
      const eventType =
        log?.event_type ||
        (order.status === 'paid'
          ? 'payment_approved'
          : order.status === 'rejected'
            ? 'payment_rejected'
            : 'receipt_received');

      const notif = generateOrderNotification(
        eventType.toLowerCase().includes('approved')
          ? 'payment_approved'
          : eventType.toLowerCase().includes('rejected')
            ? 'payment_rejected'
            : 'receipt_received',
        {
          reference: order.reference,
          buyerName: order.buyers?.full_name || 'Comprador',
          buyerPhone: order.buyers?.phone || '',
          buyerEmail: order.buyers?.email,
          ticketNumbers: formattedTickets,
          totalAmount: order.total_amount,
          rejectionReason: order.rejection_reason || undefined,
          verifyUrl:
            typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
        }
      );

      setPreparedNotification(notif);
      if (notif.whatsAppLink) {
        window.open(notif.whatsAppLink, '_blank', 'noopener,noreferrer');
        setNotifActionResult('Enlace directo a WhatsApp abierto con la plantilla oficial.');
      } else {
        setNotifActionResult('El comprador no tiene teléfono válido para WhatsApp.');
      }

      const updatedLogs = await getOrderNotificationLogs(order.id);
      setNotificationLogs(updatedLogs);
    } catch (err) {
      setNotifActionResult(
        err instanceof Error ? err.message : 'Error al reintentar notificación por WhatsApp'
      );
    } finally {
      setIsRetryingNotif(false);
    }
  };

  // REINTENTAR NOTIFICACIÓN (CORREO ELECTRÓNICO CON BREVO)
  const handleRetryEmailNotification = async (log?: NotificationLogRow) => {
    if (!order) return;
    setIsRetryingNotif(true);
    setNotifActionResult(null);
    try {
      const eventType =
        log?.event_type ||
        (order.status === 'paid'
          ? 'payment_approved'
          : order.status === 'rejected'
            ? 'payment_rejected'
            : 'payment_received');

      let receiptPngBase64: string | undefined;
      let receiptFileName: string | undefined;

      // Si es una orden pagada, generar el comprobante oficial para adjuntarlo al correo
      if (order.status === 'paid') {
        try {
          const receiptData = buildDigitalReceiptDataFromOrder(order);
          const canvas = await generateDigitalReceiptCanvas(receiptData);
          receiptPngBase64 = await convertCanvasToBase64(canvas);
          receiptFileName = formatReceiptAttachmentFileName(order.reference);
        } catch (cErr) {
          console.warn('Aviso: no se pudo regenerar canvas en reintento de correo:', cErr);
        }
      }

      const res = await retryNotification(order.id, 'email', eventType, {
        receiptPngBase64,
        receiptFileName,
        buyerEmail: order.buyers?.email,
        buyerName: order.buyers?.full_name,
        orderReference: order.reference,
        reason: order.rejection_reason || undefined,
      });

      if (res.success) {
        setNotifActionResult('¡Correo transaccional reenviado exitosamente a través de Brevo!');
      } else {
        setNotifActionResult(`Fallo al reenviar correo: ${res.error || 'Error desconocido'}`);
      }

      const updatedLogs = await getOrderNotificationLogs(order.id);
      setNotificationLogs(updatedLogs);
    } catch (err) {
      setNotifActionResult(
        err instanceof Error ? err.message : 'Error inesperado al reintentar correo transaccional'
      );
    } finally {
      setIsRetryingNotif(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderTitle}>
            <ShieldCheck size={24} color="var(--brand-accent)" />
            <div>
              <h2 className={styles.modalTitleText}>Revisión Administrativa de Orden</h2>
              <span className={styles.modalSubtitle}>
                Auditoría manual de comprobante y confirmación de venta
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mensajes de feedback */}
        {actionError && (
          <div className={styles.feedbackError}>
            <AlertTriangle size={18} />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className={styles.feedbackSuccess}>
            <CheckCircle2 size={18} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Cuerpo del Modal con las 4 Secciones Requeridas */}
        <div className={styles.modalBody}>
          <div className={styles.sectionGrid}>
            {/* 1. INFORMACIÓN DE ORDEN */}
            <div className={styles.reviewCard}>
              <div className={styles.reviewCardHeader}>
                <Hash size={16} />
                <span className={styles.reviewCardHeaderTitle}>1. Información de Orden</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Referencia:</span>
                <div className={styles.inlineCopyGroup}>
                  <span className={styles.infoValueMono}>{order.reference}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.reference, 'ref')}
                    className={styles.copyIconButton}
                    title="Copiar referencia"
                  >
                    {copiedKey === 'ref' ? <Check size={12} color="var(--admin-success, var(--color-success))" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Fecha y Hora:</span>
                <span className={`${styles.infoValue} ${styles.inlineIconValue}`}>
                  <Calendar size={13} color="var(--text-secondary, #9cb5ab)" />
                  {dateStr}
                </span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Estado Actual:</span>
                <div>
                  {order.status === 'pending_verification' && (
                    <span className={styles.badgeWarning}>
                      <Clock size={12} /> Por Validar
                    </span>
                  )}
                  {order.status === 'pending' && (
                    <span className={styles.badgeInfo}>
                      <Clock size={12} /> Reserva Temporal
                    </span>
                  )}
                  {order.status === 'paid' && (
                    <span className={styles.badgeSuccess}>
                      <CheckCircle2 size={12} /> Pagada / Aprobada
                    </span>
                  )}
                  {order.status === 'rejected' && (
                    <span className={styles.badgeDanger}>
                      <XCircle size={12} /> Rechazada
                    </span>
                  )}
                  {order.status === 'expired' && (
                    <span className={`${styles.badgeDanger} ${styles.badgeMuted}`}>
                      <AlertTriangle size={12} /> Expirada
                    </span>
                  )}
                  {order.status === 'cancelled' && (
                    <span className={styles.badgeNeutral}>
                      <X size={12} /> Cancelada
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Total Liquidado:</span>
                <span className={`${styles.infoValue} ${styles.totalValue}`}>
                  {formatCOP(order.total_amount)}
                </span>
              </div>

              {order.rejection_reason && (
                <div className={styles.rejectionReasonBox}>
                  <span className={styles.rejectionReasonLabel}>
                    Motivo de Rechazo:
                  </span>
                  <span className={styles.rejectionReasonText}>
                    {order.rejection_reason}
                  </span>
                </div>
              )}
            </div>

            {/* 2. COMPRADOR */}
            <div className={styles.reviewCard}>
              <div className={styles.reviewCardHeader}>
                <User size={16} />
                <span className={styles.reviewCardHeaderTitle}>2. Datos del Comprador</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Nombre Completo:</span>
                <span className={styles.infoValue}>{order.buyers?.full_name || 'Desconocido'}</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Documento:</span>
                <div className={styles.inlineCopyGroup}>
                  <span className={`${styles.infoValue} ${styles.documentValue}`}>
                    {maskDocumentId(order.buyers?.document_id)}
                  </span>
                  <span className={styles.protectedLabel}>(Protegido)</span>
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Teléfono Celular:</span>
                <div className={styles.contactValueGroup}>
                  {order.buyers?.phone ? (
                    <>
                      <a
                        href={`https://wa.me/57${order.buyers.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.whatsappLink}
                        title="Contactar directamente por WhatsApp"
                      >
                        <Phone size={13} />
                        {order.buyers.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.buyers!.phone, 'phone')}
                        className={styles.copyIconButton}
                        title="Copiar teléfono"
                      >
                        {copiedKey === 'phone' ? (
                          <Check size={12} color="var(--admin-success, var(--color-success))" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </>
                  ) : (
                    <span className={styles.infoValue}>N/A</span>
                  )}
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Correo Electrónico:</span>
                {order.buyers?.email ? (
                  <a
                    href={`mailto:${order.buyers.email}`}
                    className={styles.emailLink}
                  >
                    <Mail size={13} />
                    {order.buyers.email}
                  </a>
                ) : (
                  <span className={styles.infoValue}>N/A</span>
                )}
              </div>

              {order.buyers?.city && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Ciudad / Municipio:</span>
                  <span className={styles.infoValue}>{order.buyers.city}</span>
                </div>
              )}

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Preferencia de Contacto:</span>
                <div>
                  {(!order.contact_preference || order.contact_preference === 'both') && (
                    <span
                      className={`${styles.badgeSuccess} ${styles.contactPreferenceBadge}`}
                    >
                      <Phone size={11} /> WhatsApp + <Mail size={11} /> Correo
                    </span>
                  )}
                  {order.contact_preference === 'whatsapp' && (
                    <span
                      className={`${styles.badgeInfo} ${styles.contactPreferenceBadge}`}
                    >
                      <Phone size={11} /> Solo WhatsApp
                    </span>
                  )}
                  {order.contact_preference === 'email' && (
                    <span
                      className={`${styles.badgeWarning} ${styles.contactPreferenceBadge}`}
                    >
                      <Mail size={11} /> Solo Correo Electrónico
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. TICKETS */}
          <div className={styles.reviewCard}>
            <div className={styles.reviewCardHeader}>
              <Ticket size={16} />
              <span className={styles.reviewCardHeaderTitle}>
                3. Boletos Reservados ({order.ticket_count}{' '}
                {order.ticket_count === 1 ? 'número' : 'números'})
              </span>
            </div>

            <div className={styles.ticketChipsContainer}>
              {formattedTickets.length > 0 ? (
                formattedTickets.map((num, idx) => (
                  <span key={idx} className={styles.ticketChip}>
                    {num}
                  </span>
                ))
              ) : (
                <span className={styles.emptyTicketsText}>
                  No se registran boletos detallados para esta orden.
                </span>
              )}
            </div>
          </div>

          {/* 4. PAGO Y COMPROBANTE */}
          <div className={styles.reviewCard}>
            <div className={styles.reviewCardHeader}>
              <CreditCard size={16} />
              <span className={styles.reviewCardHeaderTitle}>
                4. Verificación de Pago y Comprobante
              </span>
            </div>

            <div className={`${styles.sectionGrid} ${styles.paymentSectionGrid}`}>
              <div className={styles.paymentDetailsColumn}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Método Reportado:</span>
                  <span className={`${styles.infoValue} ${styles.capitalizeValue}`}>
                    {order.payment_method || 'Transferencia Manual'}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Referencia Bancaria:</span>
                  <span className={`${styles.infoValueMono} ${styles.bankReferenceValue}`}>
                    {order.payment_gateway_id || 'No especificada'}
                  </span>
                </div>

                <div className={styles.verificationRuleBox}>
                  <span className={styles.verificationRuleTitle}>
                    Regla de Verificación Manual:
                  </span>
                  <p className={styles.verificationRuleText}>
                    {order.status === 'pending' && !hasReceipt ? (
                      <>
                        Esta orden se encuentra en reserva temporal de 10 minutos. No es posible aprobar ni rechazar el pago hasta que el comprador adjunte su soporte bancario.
                      </>
                    ) : (
                      <>
                        Verifique en la app bancaria correspondiente que los{' '}
                        <strong>{formatCOP(order.total_amount)}</strong> hayan ingresado efectivamente
                        antes de aprobar la orden.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Visor Seguro del Comprobante */}
              <div>
                <span className={styles.proofLabel}>
                  Soporte Adjunto (Acceso Seguro Temporal 15 min):
                </span>

                <div className={styles.proofViewerContainer}>
                  {isLoadingProof ? (
                    <div className={styles.proofLoading}>
                      <Clock size={24} className={styles.proofStatusIcon} />
                      <span className={styles.proofLoadingText}>Generando acceso seguro privado...</span>
                    </div>
                  ) : proofError || !signedProofUrl ? (
                    <div className={styles.proofEmptyState}>
                      <FileText
                        size={28}
                        className={styles.proofStatusIcon}
                      />
                      <span className={styles.proofEmptyText}>
                        {proofError || (order.status === 'pending'
                          ? 'El comprador aún no ha subido el comprobante de pago (reserva temporal de 10 min).'
                          : 'Sin archivo de comprobante adjunto')}
                      </span>
                    </div>
                  ) : isPdf ? (
                    <iframe
                      src={signedProofUrl}
                      title="Comprobante PDF"
                      className={styles.proofIframe}
                    />
                  ) : (
                    <img
                      src={signedProofUrl}
                      alt={`Comprobante de orden ${order.reference}`}
                      className={styles.proofImage}
                    />
                  )}

                  {signedProofUrl && (
                    <div className={styles.proofToolbar}>
                      <span>* URL con caducidad automática de 15 min</span>
                      <a
                        href={signedProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.proofOpenLink}
                      >
                        <ExternalLink size={13} />
                        Abrir en tamaño original
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Formulario de Rechazo si está activo */}
          {showRejectionForm && (
            <div className={styles.rejectionSection}>
              <div className={styles.rejectionHeader}>
                <h4
                  className={styles.rejectionTitle}
                >
                  <XCircle size={18} />
                  Indicar Motivo de Rechazo (Obligatorio)
                </h4>
                <button
                  type="button"
                  onClick={() => setShowRejectionForm(false)}
                  className={styles.cancelRejectionButton}
                >
                  Cancelar Rechazo
                </button>
              </div>

              <p className={styles.rejectionDescription}>
                Selecciona uno de los motivos comunes o describe la causa del rechazo. Los boletos
                serán liberados automáticamente para la venta pública.
              </p>

              <div className={styles.presetReasonsGrid}>
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`${styles.presetReasonButton} ${
                      selectedPreset === preset ? styles.presetReasonButtonActive : ''
                    }`}
                    onClick={() => setSelectedPreset(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label
                  className={styles.rejectionDetailsLabel}
                >
                  Detalles o instrucciones adicionales para el comprador:
                </label>
                <textarea
                  className={styles.rejectionTextarea}
                  placeholder="Ej: El valor transferido fue de $20.000 pero el total de la orden es $30.000..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              </div>

              <div className={styles.rejectionActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowRejectionForm(false)}
                  disabled={isProcessing}
                >
                  Regresar
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => void handleReject()}
                  disabled={isProcessing}
                >
                  <XCircle size={16} />
                  <span>
                    {isProcessing ? 'Procesando Rechazo...' : 'Confirmar Rechazo y Liberar Boletos'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Notificación Lista para Enviar por WhatsApp tras Aprobación / Rechazo */}
          {preparedNotification && (
            <div
              className={`${styles.notificationBox} ${
                preparedNotification.type === 'payment_rejected'
                  ? styles.notificationBoxRejected
                  : ''
              }`}
            >
              <div className={styles.notificationHeader}>
                <strong
                  className={`${styles.notificationTitle} ${preparedNotification.type === 'payment_approved' ? styles.notificationTitleSuccess : styles.notificationTitleDanger}`}
                >
                  <MessageSquare size={16} />
                  {preparedNotification.title}
                </strong>
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.compactCopyButton}`}
                  onClick={() => handleCopy(preparedNotification.messageText, 'notif')}
                >
                  {copiedKey === 'notif' ? <Check size={12} color="var(--admin-success, var(--color-success))" /> : <Copy size={12} />}
                  <span>{copiedKey === 'notif' ? 'Copiado' : 'Copiar Texto'}</span>
                </button>
              </div>

              <div className={styles.notificationMessagePreview}>
                {preparedNotification.messageText}
              </div>

              {preparedNotification.whatsAppLink ? (
                <div className={styles.notificationSendRow}>
                  <a
                    href={preparedNotification.whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnWhatsApp}
                  >
                    <MessageSquare size={16} />
                    <span>Enviar Notificación por WhatsApp</span>
                  </a>
                </div>
              ) : (
                <span className={styles.notificationNoPhone}>
                  * El comprador no registró teléfono para enlace directo de WhatsApp.
                </span>
              )}
            </div>
          )}

          {/* 5. Trazabilidad de Notificaciones (WhatsApp y Correo) */}
          <div className={`${styles.reviewCard} ${styles.notificationTraceCard}`}>
            <div className={styles.reviewCardHeader}>
              <Send size={16} className={styles.notificationTraceIcon} />
              <span className={styles.reviewCardHeaderTitle}>
                5. Trazabilidad de Notificaciones (WhatsApp y Correo)
              </span>
            </div>

            <div className={styles.notificationContent}>
              {/* Resumen de Canales Registrados */}
              <div className={`${styles.sectionGrid} ${styles.notificationSummaryGrid}`}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>📱 Destino WhatsApp:</span>
                  <span className={`${styles.infoValue} ${styles.notificationPhone}`}>
                    {order.buyers?.phone || 'Sin celular registrado'}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>✉️ Destino Correo:</span>
                  <span className={styles.infoValue}>
                    {order.buyers?.email || 'Sin correo registrado'}
                  </span>
                </div>
              </div>

              {/* Alerta si alguna notificación falló y requiere reintento */}
              {notificationLogs.some((l) => l.status === 'failed') && (
                <div className={styles.notificationFailure}>
                  <AlertTriangle size={18} className={styles.notificationFailureIcon} />
                  <div>
                    <strong>⚠️ Requiere Reintento:</strong> Se detectaron notificaciones que
                    fallaron en su entrega. Puedes reintentar el envío con los botones de acción
                    correspondientes.
                  </div>
                </div>
              )}

              {/* Historial detallado de notificaciones */}
              {notificationLogs.length > 0 ? (
                <div className={styles.notificationHistory}>
                  <span className={styles.notificationHistoryLabel}>
                    Historial de Envíos Registrados ({notificationLogs.length}):
                  </span>

                  {notificationLogs.map((log) => {
                    const isWhatsApp = log.channel === 'whatsapp';
                    const eventLabel = formatNotificationEventLabel(log.event_type);
                    const isFailed = log.status === 'failed';
                    const isSent = log.status === 'sent' || log.status === 'delivered';
                    const isPending = log.status === 'pending';

                    return (
                      <div
                        key={log.id}
                        className={`${styles.notificationLogEntry} ${isFailed ? styles.notificationLogEntryFailed : ''}`}
                      >
                        <div className={styles.notificationLogHeader}>
                          <div className={styles.notificationLogIdentity}>
                            <span
                              className={`${styles.notificationChannelBadge} ${isWhatsApp ? styles.notificationChannelWhatsApp : styles.notificationChannelEmail}`}
                            >
                              {isWhatsApp ? <Phone size={11} /> : <Mail size={11} />}
                              {isWhatsApp ? 'WhatsApp' : 'Correo'}
                            </span>

                            <strong className={styles.notificationEventTitle}>
                              {eventLabel}
                            </strong>
                          </div>

                          <div className={styles.notificationLogStatus}>
                            {isSent && (
                              <span className={`${styles.badgeSuccess} ${styles.smallBadge}`}>
                                <CheckCircle2 size={12} /> Enviada
                              </span>
                            )}
                            {isFailed && (
                              <span className={`${styles.badgeDanger} ${styles.smallBadge}`}>
                                <XCircle size={12} /> Falló
                              </span>
                            )}
                            {isPending && (
                              <span className={`${styles.badgeWarning} ${styles.smallBadge}`}>
                                <Clock size={12} /> Pendiente
                              </span>
                            )}

                            <span className={styles.notificationAttempts}>
                              {log.attempts} {log.attempts === 1 ? 'intento' : 'intentos'}
                            </span>
                          </div>
                        </div>

                        {/* Metadatos: Destinatario y Fecha */}
                        <div
                          className={styles.notificationMeta}
                        >
                          <span>
                            <strong>Destinatario:</strong> {log.recipient}
                          </span>
                          <span className={styles.notificationDate}>
                            <Calendar size={11} />
                            {new Date(log.created_at).toLocaleString('es-CO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>

                        {/* Error detallado sanitizado si falló */}
                        {log.error_message && (
                          <div
                            className={styles.notificationError}
                          >
                            <strong>Causa del error:</strong> {log.error_message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.notificationEmpty}>
                  Las notificaciones transaccionales se disparan automáticamente y quedan
                  registradas al enviar comprobantes, aprobar o rechazar pagos.
                </p>
              )}

              {/* Mensaje de resultado de reintento */}
              {notifActionResult && (
                <div
                  className={`${styles.notificationActionResult} ${notifActionResult.startsWith('¡') || notifActionResult.includes('abierto') ? styles.notificationActionSuccess : styles.notificationActionWarning}`}
                >
                  <AlertCircle size={15} />
                  <span>{notifActionResult}</span>
                </div>
              )}

              {/* Acciones de Reintento Administrativo */}
              <div className={styles.notificationActions}>
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.notificationRetryButton}`}
                  onClick={() => void handleRetryWhatsAppNotification()}
                  disabled={isRetryingNotif || !order.buyers?.phone}
                  title="Abrir WhatsApp oficial para enviar o reenviar confirmación"
                >
                  <Phone size={13} color="#25d366" />
                  <span>Reenviar por WhatsApp</span>
                </button>

                {order.buyers?.email && (
                  <button
                    type="button"
                    className={`${styles.btnSecondary} ${styles.notificationRetryButton}`}
                    onClick={() => void handleRetryEmailNotification()}
                    disabled={isRetryingNotif}
                    title="Reenviar correo transaccional oficial a través de Brevo"
                  >
                    <Mail size={13} color="#0084ff" />
                    <span>{isRetryingNotif ? 'Enviando...' : 'Reenviar Correo (Brevo)'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className={styles.modalFooter}>
          <div className={styles.footerStatusText}>
            {canReviewPayment ? (
              <span>⚠️ La orden tiene comprobante adjunto y requiere verificación manual.</span>
            ) : order.status === 'pending' ? (
              <span>⏳ Reserva temporal (10 min): en espera de que el comprador suba su comprobante.</span>
            ) : (
              <span>
                Orden en estado <strong>{order.status}</strong>.
              </span>
            )}
          </div>

          <div className={styles.footerActions}>
            {order.status === 'paid' && (
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.receiptButton}`}
                onClick={() => setIsReceiptModalOpen(true)}
              >
                <Download size={15} />
                <span>Emitir Comprobante Digital</span>
              </button>
            )}

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={isProcessing}
            >
              Cerrar
            </button>

            {isPendingAction && !showRejectionForm && (
              <>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => setShowRejectionForm(true)}
                  disabled={isProcessing}
                >
                  <XCircle size={16} />
                  <span>Rechazar Pago</span>
                </button>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setIsConfirmApproveOpen(true)}
                  disabled={isProcessing}
                >
                  <CheckCircle2 size={16} />
                  <span>{isProcessing ? 'Aprobando...' : 'Aprobar Pago'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {order.status === 'paid' && isReceiptModalOpen && (
        <DigitalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          receiptData={buildDigitalReceiptDataFromOrder(order)}
        />
      )}

      {/* Modal de Confirmación de Aprobación de Pago */}
      <AdminConfirmPaymentModal
        isOpen={isConfirmApproveOpen}
        order={order}
        isProcessing={isProcessing}
        onConfirm={handleApprove}
        onClose={() => setIsConfirmApproveOpen(false)}
      />
    </div>
  );
};
