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
  recordWhatsAppOpened,
  recordWhatsAppSentManually,
  getNotificationStatusBadge,
  computeEmailTraceability,
  verifyAndRetryEmailNotification,
  maskEmail,
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
  const [isWhatsAppOpened, setIsWhatsAppOpened] = useState<boolean>(false);

  // Trazabilidad de notificaciones (WhatsApp y Email)
  const [notificationLogs, setNotificationLogs] = useState<NotificationLogRow[]>([]);
  const [isRetryingNotif, setIsRetryingNotif] = useState<boolean>(false);
  const [notifActionResult, setNotifActionResult] = useState<string | null>(null);

  // Comprobante digital
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  // Cargar trazabilidad de notificaciones y URL segura firmada cuando cambia la orden
  useEffect(() => {
    let active = true;

    setIsWhatsAppOpened(false);
    setPreparedNotification(null);

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

  const emailTraceability = computeEmailTraceability(order, notificationLogs);

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
          setIsWhatsAppOpened(false);
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
          setIsWhatsAppOpened(false);
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

  // Control de apertura y confirmación manual de WhatsApp
  const handleOpenWhatsAppManual = async (whatsAppLink?: string) => {
    if (!order || !whatsAppLink) return;
    setIsWhatsAppOpened(true);
    window.open(whatsAppLink, '_blank', 'noopener,noreferrer');

    const eventType =
      order.status === 'paid'
        ? NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED
        : order.status === 'rejected'
          ? NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED
          : NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED;

    if (order.buyers?.phone) {
      await recordWhatsAppOpened(order.id, eventType, order.buyers.phone);
      const updatedLogs = await getOrderNotificationLogs(order.id);
      setNotificationLogs(updatedLogs);
    }
    setNotifActionResult('Enlace a WhatsApp abierto para envío manual con la plantilla oficial.');
  };

  const handleMarkWhatsAppAsSent = async () => {
    if (!order || !order.buyers?.phone) return;
    const eventType =
      order.status === 'paid'
        ? NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED
        : order.status === 'rejected'
          ? NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED
          : NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED;

    await recordWhatsAppSentManually(order.id, eventType, order.buyers.phone);
    const updatedLogs = await getOrderNotificationLogs(order.id);
    setNotificationLogs(updatedLogs);
    setNotifActionResult('Se registró la confirmación como enviada manualmente por el administrador.');
  };

  // REINTENTAR / ABRIR NOTIFICACIÓN (WHATSAPP MANUAL)
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
        setIsWhatsAppOpened(true);
        window.open(notif.whatsAppLink, '_blank', 'noopener,noreferrer');
        await recordWhatsAppOpened(
          order.id,
          eventType.toLowerCase().includes('approved')
            ? NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED
            : eventType.toLowerCase().includes('rejected')
              ? NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED
              : NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED,
          order.buyers?.phone || ''
        );
        setNotifActionResult('Enlace a WhatsApp abierto para envío manual con la plantilla oficial.');
      } else {
        setNotifActionResult('El comprador no tiene teléfono válido para WhatsApp.');
      }

      const updatedLogs = await getOrderNotificationLogs(order.id);
      setNotificationLogs(updatedLogs);
    } catch (err) {
      setNotifActionResult(
        err instanceof Error ? err.message : 'Error al abrir WhatsApp para envío manual'
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
          ? NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED
          : order.status === 'rejected'
            ? NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED
            : NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED);

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

      const res = await verifyAndRetryEmailNotification(order.id, eventType, {
        receiptPngBase64,
        receiptFileName,
        buyerEmail: order.buyers?.email,
        buyerName: order.buyers?.full_name,
        orderReference: order.reference,
        reason: order.rejection_reason || undefined,
      });

      if (res.success) {
        setNotifActionResult('¡Correo transaccional reenviado exitosamente a través de Brevo!');
      } else if (res.alreadyProcessed) {
        setNotifActionResult(res.error || 'Correo ya procesado: ya existe confirmación de despacho para esta orden.');
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong
                    className={`${styles.notificationTitle} ${preparedNotification.type === 'payment_approved' ? styles.notificationTitleSuccess : styles.notificationTitleDanger}`}
                  >
                    <MessageSquare size={16} />
                    {preparedNotification.title}
                  </strong>
                  <span className={styles.manualChannelTag}>WhatsApp manual</span>
                </div>
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${styles.compactCopyButton}`}
                  onClick={() => handleCopy(preparedNotification.messageText, 'notif')}
                >
                  {copiedKey === 'notif' ? <Check size={12} color="var(--admin-success, var(--color-success))" /> : <Copy size={12} />}
                  <span>{copiedKey === 'notif' ? 'Copiado' : 'Copiar Texto'}</span>
                </button>
              </div>

              {/* Aviso normativo: WhatsApp manual */}
              <div className={styles.manualNoticeBox}>
                <AlertCircle size={16} className={styles.manualNoticeIcon} />
                <span className={styles.manualNoticeText}>
                  <strong>WhatsApp manual:</strong> El sistema prepara el mensaje, pero el envío debe realizarse manualmente por el administrador.
                </span>
              </div>

              <div className={styles.notificationMessagePreview}>
                {preparedNotification.messageText}
              </div>

              {preparedNotification.whatsAppLink ? (
                <div className={styles.notificationSendRow}>
                  <button
                    type="button"
                    onClick={() => void handleOpenWhatsAppManual(preparedNotification.whatsAppLink)}
                    className={`${styles.btnWhatsApp} ${styles.btnWhatsAppManual}`}
                  >
                    <ExternalLink size={16} />
                    <span>Abrir WhatsApp</span>
                  </button>

                  {isWhatsAppOpened && (
                    <button
                      type="button"
                      onClick={() => void handleMarkWhatsAppAsSent()}
                      className={`${styles.btnSecondary} ${styles.compactCopyButton}`}
                      style={{
                        padding: '0.6rem 0.95rem',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                      }}
                    >
                      <CheckCircle2 size={14} color="var(--admin-success, #10b981)" />
                      <span>Marcar como enviado manualmente</span>
                    </button>
                  )}
                </div>
              ) : (
                <span className={styles.notificationNoPhone}>
                  * El comprador no registró teléfono para enlace directo de WhatsApp.
                </span>
              )}
            </div>
          )}

          {/* 5. Canales de Confirmación y Trazabilidad */}
          <div className={`${styles.reviewCard} ${styles.notificationTraceCard}`}>
            <div className={styles.reviewCardHeader} style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={16} className={styles.notificationTraceIcon} />
                <span className={styles.reviewCardHeaderTitle}>
                  5. Canales de Confirmación y Trazabilidad
                </span>
              </div>

              {/* Distintivo de preferencia global */}
              <div>
                {(!order.contact_preference || order.contact_preference === 'both') && (
                  <span className={`${styles.badgeSuccess} ${styles.smallBadge}`} title="Preferencia: Ambos canales">
                    <Phone size={10} /> + <Mail size={10} /> WhatsApp + Correo
                  </span>
                )}
                {order.contact_preference === 'email' && (
                  <span className={`${styles.badgeWarning} ${styles.smallBadge}`} title="Preferencia: Exclusivamente Correo">
                    <Mail size={10} /> Solo Correo
                  </span>
                )}
                {order.contact_preference === 'whatsapp' && (
                  <span className={`${styles.badgeInfo} ${styles.smallBadge}`} title="Preferencia: Exclusivamente WhatsApp">
                    <Phone size={10} /> Solo WhatsApp
                  </span>
                )}
              </div>
            </div>

            <div className={styles.notificationContent}>
              {/* Bloque de Canales de Confirmación Separados */}
              <div className={styles.channelsGrid}>
                {/* Canal A: Correo Automático (Brevo) */}
                <div className={`${styles.channelCard} ${styles.channelCardEmail}`}>
                  <div className={styles.channelCardHeader}>
                    <div className={styles.channelTitleGroup}>
                      <Mail size={16} className={styles.channelTitleEmail} />
                      <span>Correo automático</span>
                    </div>

                    <span
                      className={`${
                        emailTraceability.badgeVariant === 'success'
                          ? styles.badgeSuccess
                          : emailTraceability.badgeVariant === 'danger'
                            ? styles.badgeDanger
                            : emailTraceability.badgeVariant === 'warning'
                              ? styles.badgeWarning
                              : styles.badgeNeutral
                      } ${styles.smallBadge}`}
                    >
                      {emailTraceability.badgeVariant === 'success' && <CheckCircle2 size={12} />}
                      {emailTraceability.badgeVariant === 'danger' && <XCircle size={12} />}
                      {emailTraceability.badgeVariant === 'warning' && <Clock size={12} />}
                      {emailTraceability.label}
                    </span>
                  </div>

                  <p className={styles.channelCopy}>
                    Correo automático: se genera cuando el pago es aprobado.
                  </p>

                  <div className={styles.channelMetaList}>
                    <div className={styles.channelMetaRow}>
                      <span className={styles.channelMetaKey}>Destinatario:</span>
                      <span className={styles.channelMetaVal}>{emailTraceability.recipientMasked}</span>
                    </div>

                    <div className={styles.channelMetaRow}>
                      <span className={styles.channelMetaKey}>Intentos:</span>
                      <span className={styles.channelMetaVal}>
                        {emailTraceability.attempts}{' '}
                        {emailTraceability.attempts === 1 ? 'intento' : 'intentos'}
                      </span>
                    </div>

                    {emailTraceability.messageId && (
                      <div className={styles.channelMetaRow}>
                        <span className={styles.channelMetaKey}>ID Brevo:</span>
                        <span className={styles.messageIdCode}>{emailTraceability.messageId}</span>
                      </div>
                    )}

                    {emailTraceability.errorMessage && (
                      <div className={styles.channelMetaRow}>
                        <span className={styles.channelMetaKey}>Fallo:</span>
                        <span
                          className={styles.notificationError}
                          style={{ margin: 0, padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                        >
                          {emailTraceability.errorMessage}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className={styles.channelActions}>
                    {emailTraceability.isAlreadyProcessed ? (
                      <span className={styles.processedNotice}>
                        <CheckCircle2 size={13} />
                        <span>Correo ya procesado</span>
                      </span>
                    ) : emailTraceability.canRetry ? (
                      <button
                        type="button"
                        className={`${styles.btnSecondary} ${styles.notificationRetryButton}`}
                        onClick={() => void handleRetryEmailNotification()}
                        disabled={isRetryingNotif}
                        title="Reintentar despacho de correo transaccional oficial"
                      >
                        <Mail size={13} color="#0084ff" />
                        <span>{isRetryingNotif ? 'Enviando...' : 'Reintentar correo'}</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Canal B: WhatsApp Manual */}
                <div className={`${styles.channelCard} ${styles.channelCardWhatsApp}`}>
                  <div className={styles.channelCardHeader}>
                    <div className={styles.channelTitleGroup}>
                      <Phone size={16} className={styles.channelTitleWhatsApp} />
                      <span>WhatsApp manual</span>
                    </div>

                    <span
                      className={`${
                        !order.buyers?.phone
                          ? styles.badgeDanger
                          : order.contact_preference === 'email'
                            ? styles.badgeNeutral
                            : styles.badgeWarning
                      } ${styles.smallBadge}`}
                    >
                      {order.contact_preference === 'email' ? 'No requerido' : 'Canal manual'}
                    </span>
                  </div>

                  <p className={styles.channelCopy}>
                    WhatsApp: requiere envío manual por el administrador.
                  </p>

                  <div className={styles.channelMetaList}>
                    <div className={styles.channelMetaRow}>
                      <span className={styles.channelMetaKey}>Destinatario:</span>
                      <span className={styles.channelMetaVal}>
                        {order.buyers?.phone || 'Sin celular registrado'}
                      </span>
                    </div>

                    <div className={styles.channelMetaRow}>
                      <span className={styles.channelMetaKey}>Modalidad:</span>
                      <span className={styles.channelMetaVal}>Plantilla web wa.me</span>
                    </div>
                  </div>

                  <div className={styles.channelActions}>
                    <button
                      type="button"
                      className={`${styles.btnSecondary} ${styles.notificationRetryButton}`}
                      onClick={() => void handleRetryWhatsAppNotification()}
                      disabled={isRetryingNotif || !order.buyers?.phone}
                      title="Abrir WhatsApp oficial para enviar o reenviar plantilla manual"
                    >
                      <Phone size={13} color="#25d366" />
                      <span>Abrir WhatsApp (Manual)</span>
                    </button>

                    {isWhatsAppOpened && (
                      <button
                        type="button"
                        className={`${styles.btnSecondary} ${styles.compactCopyButton}`}
                        onClick={() => void handleMarkWhatsAppAsSent()}
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        <CheckCircle2 size={12} color="#10b981" />
                        <span>Marcar como enviado</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Alerta si alguna notificación falló y requiere atención */}
              {notificationLogs.some((l) => l.status === 'failed') && (
                <div className={styles.notificationFailure} style={{ marginTop: '1rem' }}>
                  <AlertTriangle size={18} className={styles.notificationFailureIcon} />
                  <div>
                    <strong>⚠️ Atención en Notificaciones:</strong> Se detectaron intentos fallidos.
                    Puedes verificar las causas en el historial o reintentar el correo según corresponda.
                  </div>
                </div>
              )}

              {/* Historial detallado de notificaciones */}
              {notificationLogs.length > 0 ? (
                <div className={styles.notificationHistory} style={{ marginTop: '1rem' }}>
                  <span className={styles.notificationHistoryLabel}>
                    Historial de Envíos Registrados ({notificationLogs.length}):
                  </span>

                  {notificationLogs.map((log) => {
                    const isWhatsApp = log.channel === 'whatsapp';
                    const eventLabel = formatNotificationEventLabel(log.event_type);
                    const isFailed = log.status === 'failed';
                    const badge = getNotificationStatusBadge(log);
                    const logMeta = (typeof log.metadata === 'object' && log.metadata !== null
                      ? log.metadata
                      : {}) as Record<string, any>;
                    const logMessageId = logMeta?.messageId || logMeta?.message_id;

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
                              {isWhatsApp ? 'WhatsApp (Manual)' : 'Correo (Brevo)'}
                            </span>

                            <strong className={styles.notificationEventTitle}>
                              {eventLabel}
                            </strong>
                          </div>

                          <div className={styles.notificationLogStatus}>
                            <span
                              className={`${
                                badge.variant === 'success'
                                  ? styles.badgeSuccess
                                  : badge.variant === 'info'
                                    ? styles.badgeInfo
                                    : badge.variant === 'danger'
                                      ? styles.badgeDanger
                                      : styles.badgeWarning
                              } ${styles.smallBadge}`}
                            >
                              {badge.variant === 'success' && <CheckCircle2 size={12} />}
                              {badge.variant === 'info' && <ExternalLink size={12} />}
                              {badge.variant === 'warning' && <Clock size={12} />}
                              {badge.variant === 'danger' && <XCircle size={12} />}
                              {badge.label}
                            </span>

                            <span className={styles.notificationAttempts}>
                              {log.attempts} {log.attempts === 1 ? 'intento' : 'intentos'}
                            </span>
                          </div>
                        </div>

                        {/* Metadatos: Destinatario parcialmente visible y Fecha */}
                        <div className={styles.notificationMeta}>
                          <span>
                            <strong>Destinatario:</strong>{' '}
                            {isWhatsApp ? log.recipient : maskEmail(log.recipient)}
                          </span>
                          <span className={styles.notificationDate}>
                            <Calendar size={11} />
                            {new Date(log.created_at).toLocaleString('es-CO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>

                        {/* Brevo messageId para canal email */}
                        {logMessageId && (
                          <div className={styles.channelMetaRow} style={{ border: 'none', padding: 0 }}>
                            <span className={styles.channelMetaKey}>Message ID:</span>
                            <span className={styles.messageIdCode}>{logMessageId}</span>
                          </div>
                        )}

                        {/* Error detallado sanitizado si falló */}
                        {log.error_message && (
                          <div className={styles.notificationError}>
                            <strong>Causa del error:</strong> {log.error_message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.notificationEmpty} style={{ marginTop: '0.75rem' }}>
                  Las notificaciones transaccionales quedan registradas al enviar comprobantes,
                  aprobar o rechazar pagos. El correo se envía automáticamente vía Brevo, y WhatsApp
                  se prepara para su envío manual por el administrador.
                </p>
              )}

              {/* Mensaje de resultado de acción */}
              {notifActionResult && (
                <div
                  className={`${styles.notificationActionResult} ${
                    notifActionResult.startsWith('¡') ||
                    notifActionResult.includes('abierto') ||
                    notifActionResult.includes('procesado')
                      ? styles.notificationActionSuccess
                      : styles.notificationActionWarning
                  }`}
                  style={{ marginTop: '0.75rem' }}
                >
                  <AlertCircle size={15} />
                  <span>{notifActionResult}</span>
                </div>
              )}
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
