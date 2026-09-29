import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  type OrderWithDetails,
  getSignedProofUrl,
} from '@/services/paymentService';
import { formatCOP, formatTicketNumber, maskDocumentId } from '@/lib/utils';
import {
  recordWhatsAppOpened,
  NOTIFICATION_EVENT_TYPES,
  buildPaymentApprovedMessage,
  buildPaymentRejectedMessage,
} from '@/services/notificationService';
import { createWhatsAppLink } from '@/services/whatsappService';
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
  Download,
  Receipt,
} from 'lucide-react';
import { DigitalReceiptModal } from '@/components/receipt/DigitalReceiptModal';
import { AdminConfirmPaymentModal } from './AdminConfirmPaymentModal';
import { AdminRejectPaymentModal } from './AdminRejectPaymentModal';
import { buildDigitalReceiptDataFromOrder } from '@/services/emailService';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import styles from './AdminOrderReviewModal.module.css';

interface AdminOrderReviewModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void | Promise<void>;
  allowPaymentActions?: boolean;
}

const getOrderStatusLabel = (status: string) => {
  switch (status) {
    case 'pending_verification':
      return 'Pendiente de revisión';
    case 'pending':
      return 'En reserva';
    case 'paid':
      return 'Pagado';
    case 'rejected':
      return 'Rechazado';
    case 'expired':
      return 'Vencido';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Estado no disponible';
  }
};

const getPaymentMethodLabel = (method: string | null | undefined) => {
  switch (method?.toLowerCase()) {
    case 'wompi':
      return 'Wompi';
    case 'bold':
      return 'Bold';
    case 'mercadopago':
      return 'Mercado Pago';
    case 'transfer_manual':
      return 'Transferencia bancaria';
    case 'cash':
      return 'Efectivo';
    default:
      return method ? 'Otro medio de pago' : 'No registrado';
  }
};

export const AdminOrderReviewModal: React.FC<AdminOrderReviewModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
  allowPaymentActions = false,
}) => {
  // Configuración del sistema
  const systemSettings = useSystemSettings();
  const reservationMinutes = systemSettings?.reservation_duration_minutes || 10;

  // Estados de comprobante seguro
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState<boolean>(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isPurgedProof, setIsPurgedProof] = useState<boolean>(false);

  // Modales de Aprobación y Rechazo guiados
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState<boolean>(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Control de copiado al portapapeles
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Comprobante digital
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  // Cargar URL segura firmada del comprobante cuando cambia la orden
  useEffect(() => {
    let active = true;

    const fetchSignedUrl = async () => {
      if (!isOpen || !order?.receipt_url) {
        if (active) {
          setSignedProofUrl(null);
          setIsLoadingProof(false);
          setProofError(null);
          setIsPurgedProof(false);
        }
        return;
      }

      if (order.receipt_purged) {
        if (active) {
          setSignedProofUrl(null);
          setIsLoadingProof(false);
          setIsPurgedProof(true);
          setProofError(null);
        }
        return;
      }

      setIsLoadingProof(true);
      setProofError(null);
      setIsPurgedProof(false);
      try {
        const res = await getSignedProofUrl(order.receipt_url, 900); // 15 min
        if (active) {
          if (res.url) {
            setSignedProofUrl(res.url);
          } else if (res.isPurged) {
            setIsPurgedProof(true);
            setProofError(null);
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
  }, [isOpen, order?.id, order?.receipt_url, order?.receipt_purged]);

  // â”€â”€ HOOKS â”€â”€ Siempre antes de cualquier early return â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Canal directo de WhatsApp para la orden actual (si está pagada o rechazada)
  const currentOrderWhatsApp = useMemo(() => {
    if (!order || !['paid', 'rejected'].includes(order.status)) return null;
    const phone = order.buyers?.phone;
    if (!phone || phone.trim().length === 0 || phone === 'Sin teléfono') return null;

    const formattedTkts = (order.tickets || []).map((t) => formatTicketNumber(t.number));
    const isPaid = order.status === 'paid';
    const raffleObj = (order as any).raffle || (order as any).raffles;

    const text = isPaid
      ? buildPaymentApprovedMessage({
          reference: order.reference,
          buyerName: order.buyers?.full_name || 'Comprador',
          buyerPhone: phone,
          buyerEmail: order.buyers?.email,
          ticketNumbers: formattedTkts,
          totalAmount: order.total_amount,
          raffleTitle: raffleObj?.title,
          drawDate: raffleObj?.draw_date,
          supportPhone: raffleObj?.support_phone,
          verifyUrl:
            typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
        })
      : buildPaymentRejectedMessage({
          reference: order.reference,
          buyerName: order.buyers?.full_name || 'Comprador',
          buyerPhone: phone,
          buyerEmail: order.buyers?.email,
          ticketNumbers: formattedTkts,
          totalAmount: order.total_amount,
          raffleTitle: raffleObj?.title,
          supportPhone: raffleObj?.support_phone,
          rejectionReason: order.rejection_reason || undefined,
          verifyUrl:
            typeof window !== 'undefined' ? `${window.location.origin}/verificar` : '/verificar',
        });

    const link = createWhatsAppLink(phone, text);
    return { phone, text, link, isPaid };
  }, [order]);
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (!isOpen || !order) return null;

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const hasReceipt = Boolean(order.receipt_url && order.receipt_url.trim().length > 0);
  const isPurged = Boolean(order.receipt_purged || isPurgedProof);
  const canReviewPayment = allowPaymentActions && order.status === 'pending_verification' && hasReceipt;
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

  // APROBACIÃ“N EXITOSA (coordinada desde AdminConfirmPaymentModal)
  const handleApproveSuccess = async (updatedOrder: OrderWithDetails, emailSent: boolean) => {
    setIsConfirmApproveOpen(false);
    setActionSuccess(
      emailSent && updatedOrder.buyers?.email
        ? `¡Pago aprobado! Se confirmaron definitivamente ${updatedOrder.ticket_count} boletos y se despachó el comprobante a ${updatedOrder.buyers.email}.`
        : `¡Pago aprobado! Se confirmaron definitivamente ${updatedOrder.ticket_count} boletos como vendidos.`
    );
    await onOrderUpdated();
  };

  // RECHAZO EXITOSO (coordinado desde AdminRejectPaymentModal)
  const handleRejectSuccess = async (
    updatedOrder: OrderWithDetails,
    emailSent: boolean,
    _reason: string
  ) => {
    setIsRejectModalOpen(false);
    setActionSuccess(
      emailSent && updatedOrder.buyers?.email
        ? `¡Orden rechazada y boletos liberados! Se despachó el correo de notificación a ${updatedOrder.buyers.email}.`
        : `¡Orden rechazada y boletos liberados! La orden quedó registrada como no aprobada.`
    );
    await onOrderUpdated();
  };

  // Abrir WhatsApp del banner superior (registra el evento en auditoría)
  const handleOpenWhatsAppManual = async (whatsAppLink?: string) => {
    if (!order || !whatsAppLink) return;
    window.open(whatsAppLink, '_blank', 'noopener,noreferrer');
    if (order.buyers?.phone) {
      const eventType =
        order.status === 'paid'
          ? NOTIFICATION_EVENT_TYPES.PAYMENT_APPROVED
          : order.status === 'rejected'
            ? NOTIFICATION_EVENT_TYPES.PAYMENT_REJECTED
            : NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED;
      await recordWhatsAppOpened(order.id, eventType, order.buyers.phone);
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
          <h2 className={styles.modalTitleText}>Revisión del pedido</h2>
              <span className={styles.modalSubtitle}>
            Revisión manual del comprobante y confirmación de los boletos
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar ventana de revisión"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mensajes de feedback */}
        {actionSuccess && (
          <div className={styles.feedbackSuccess}>
            <CheckCircle2 size={18} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Cuerpo del Modal con las 4 Secciones Requeridas */}
        <div className={styles.modalBody}>
          {/* Banner Persistente Superior de Notificación Directa WhatsApp */}
          {currentOrderWhatsApp && (
            <div
              className={`${styles.topWhatsAppBanner} ${
                currentOrderWhatsApp.isPaid
                  ? styles.topWhatsAppBannerPaid
                  : styles.topWhatsAppBannerRejected
              }`}
            >
              <div className={styles.topWhatsAppInfoGroup}>
                <div
                  className={`${styles.topWhatsAppIconWrapper} ${
                    currentOrderWhatsApp.isPaid
                      ? styles.topWhatsAppIconPaid
                      : styles.topWhatsAppIconRejected
                  }`}
                >
                  <MessageSquare size={18} />
                </div>
                <div className={styles.topWhatsAppTextGroup}>
                  <strong className={styles.topWhatsAppTitle}>
                    Mensaje por WhatsApp: {currentOrderWhatsApp.isPaid ? 'pago aprobado' : 'pago rechazado'}
                  </strong>
                  <span className={styles.topWhatsAppDesc}>
                    Para: {currentOrderWhatsApp.phone} &bull; El mensaje está listo para enviar
                  </span>
                </div>
              </div>

              <div className={styles.topWhatsAppActions}>
                <button
                  type="button"
                  onClick={() => void handleOpenWhatsAppManual(currentOrderWhatsApp.link)}
                  className={styles.topBtnWhatsApp}
                >
                  <ExternalLink size={14} />
                  <span>Abrir WhatsApp</span>
                </button>
                <button
                  type="button"
                  className={styles.topBtnCopy}
                  onClick={() => handleCopy(currentOrderWhatsApp.text, 'top_wa')}
                  title="Copiar texto del mensaje al portapapeles"
                >
                  {copiedKey === 'top_wa' ? (
                    <Check size={13} color="var(--admin-success, #10b981)" />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span>{copiedKey === 'top_wa' ? 'Copiado' : 'Copiar Texto'}</span>
                </button>
              </div>
            </div>
          )}
          <div className={styles.sectionGrid}>
            {/* 1. INFORMACIÃ“N DE ORDEN */}
            <div className={styles.reviewCard}>
              <div className={styles.reviewCardHeader}>
                <Hash size={16} />
                <span className={styles.reviewCardHeaderTitle}>1. Datos del pedido</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Referencia:</span>
                <div className={styles.inlineCopyGroup}>
                  <span className={styles.infoValueMono}>{order.reference}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.reference, 'ref')}
                    className={styles.copyIconButton}
                    title="Copiar número de referencia"
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
                <span className={styles.infoLabel}>Estado:</span>
                <div>
                  {order.status === 'pending_verification' && (
                    <span className={styles.badgeWarning}>
                      <Clock size={12} /> Pendiente de revisión
                    </span>
                  )}
                  {order.status === 'pending' && (
                    <span className={styles.badgeInfo}>
                      <Clock size={12} /> En reserva
                    </span>
                  )}
                  {order.status === 'paid' && (
                    <span className={styles.badgeSuccess}>
                      <CheckCircle2 size={12} /> Pagado
                    </span>
                  )}
                  {order.status === 'rejected' && (
                    <span className={styles.badgeDanger}>
                      <XCircle size={12} /> Rechazada
                    </span>
                  )}
                  {order.status === 'expired' && (
                    <span className={`${styles.badgeDanger} ${styles.badgeMuted}`}>
                      <AlertTriangle size={12} /> Vencido
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
                <span className={styles.infoLabel}>Valor del pedido:</span>
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
                <span className={styles.reviewCardHeaderTitle}>2. Datos del comprador</span>
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
                  <span className={styles.protectedLabel}>(Número parcialmente oculto)</span>
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Teléfono:</span>
                <div className={styles.contactValueGroup}>
                  {order.buyers?.phone ? (
                    <>
                      <a
                        href={`https://wa.me/57${order.buyers.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.whatsappLink}
                        title="Escribir al comprador por WhatsApp"
                      >
                        <Phone size={13} />
                        {order.buyers.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.buyers!.phone, 'phone')}
                        className={styles.copyIconButton}
                        title="Copiar número de teléfono"
                      >
                        {copiedKey === 'phone' ? (
                          <Check size={12} color="var(--admin-success, var(--color-success))" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </>
                  ) : (
                    <span className={styles.infoValue}>No registrado</span>
                  )}
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Correo:</span>
                {order.buyers?.email ? (
                  <a
                    href={`mailto:${order.buyers.email}`}
                    className={styles.emailLink}
                  >
                    <Mail size={13} />
                    {order.buyers.email}
                  </a>
                ) : (
                  <span className={styles.infoValue}>No registrado</span>
                )}
              </div>

              {order.buyers?.city && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Ciudad / Municipio:</span>
                  <span className={styles.infoValue}>{order.buyers.city}</span>
                </div>
              )}

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Medio de contacto elegido:</span>
                <div>
                  {(!order.contact_preference || order.contact_preference === 'both') && (
                    <span
                      className={`${styles.badgeSuccess} ${styles.contactPreferenceBadge}`}
                    >
                      <Phone size={11} /> WhatsApp y <Mail size={11} /> correo
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
                      <Mail size={11} /> Solo correo
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
                  3. Boletos reservados ({order.ticket_count}{' '}
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
                No hay boletos registrados para este pedido.
                </span>
              )}
            </div>
          </div>

          {/* 4. PAGO Y COMPROBANTE */}
          <div className={styles.reviewCard}>
            <div className={styles.reviewCardHeader}>
              <CreditCard size={16} />
              <span className={styles.reviewCardHeaderTitle}>
                4. Revisión del pago y comprobante
              </span>
            </div>

            <div className={`${styles.sectionGrid} ${styles.paymentSectionGrid}`}>
              <div className={styles.paymentDetailsColumn}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Medio de pago:</span>
                  <span className={`${styles.infoValue} ${styles.capitalizeValue}`}>
                    {getPaymentMethodLabel(order.payment_method)}
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
                    Revisión del pago:
                  </span>
                  <p className={styles.verificationRuleText}>
                    {order.status === 'pending' && !hasReceipt ? (
                      <>
                        Este pedido está reservado por {reservationMinutes} minutos. Podrás aprobarlo o rechazarlo cuando el comprador adjunte el comprobante bancario.
                      </>
                    ) : (
                      <>
                        Confirma en la aplicación de tu banco que los{' '}
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
                  Comprobante adjunto (disponible durante 15 minutos):
                </span>

                {/* Avisos de Retención de 5 días */}
                {!isPurged && (order.status === 'paid' || order.status === 'rejected') && (
                  <div className={styles.retentionNoticePill}>
                    <Clock size={15} className={styles.retentionNoticeIcon} />
                    <span>
                      <strong>Conservación del comprobante (5 días):</strong> Este comprobante se guardará hasta el{' '}
                      <strong>
                        {order.verified_at
                          ? new Date(new Date(order.verified_at).getTime() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : 'cumplirse 5 días desde su revisión'}
                      </strong>. Después, el archivo se eliminará automáticamente para liberar espacio.
                    </span>
                  </div>
                )}

                {!isPurged && order.status === 'pending_verification' && (
                  <div className={styles.retentionPendingPill}>
                    <ShieldCheck size={15} className={styles.retentionNoticeIcon} />
                    <span>
                      <strong>Comprobante protegido:</strong> El archivo de este pedido se conservará hasta que el pago sea aprobado o rechazado. Los pagos pendientes no se eliminan.
                    </span>
                  </div>
                )}

                <div className={styles.proofViewerContainer}>
                  {isLoadingProof ? (
                    <div className={styles.proofLoading}>
                      <Clock size={24} className={styles.proofStatusIcon} />
                      <span className={styles.proofLoadingText}>Preparando el comprobante...</span>
                    </div>
                  ) : isPurged ? (
                    <div className={styles.proofPurgedCard}>
                      <ShieldCheck size={36} className={styles.proofPurgedIcon} />
                      <h4 className={styles.proofPurgedTitle}>
                        Comprobante eliminado después de su conservación
                      </h4>
                      <p className={styles.proofPurgedDesc}>
                        El archivo se eliminó después de conservarse durante <strong>5 días</strong> para liberar espacio.
                      </p>
                      <div className={styles.proofPurgedMeta}>
                        <span>Estado del pedido: <strong>{getOrderStatusLabel(order.status)}</strong></span>
                        {order.receipt_purged_at && (
                          <span>Fecha de eliminación: <strong>{new Date(order.receipt_purged_at).toLocaleDateString('es-CO', { dateStyle: 'medium' })}</strong></span>
                        )}
                      </div>
                      <div className={styles.proofPurgedGuarantee}>
                      El pedido #{order.reference}, el comprador y los boletos asignados permanecen registrados.
                      </div>
                    </div>
                  ) : proofError || !signedProofUrl ? (
                    <div className={styles.proofEmptyState}>
                      <FileText
                        size={28}
                        className={styles.proofStatusIcon}
                      />
                      <span className={styles.proofEmptyText}>
                        {proofError || (order.status === 'pending'
                          ? `El comprador aún no ha adjuntado el comprobante de pago. La reserva dura ${reservationMinutes} minutos.`
                          : 'No hay un comprobante adjunto')}
                      </span>
                    </div>
                  ) : isPdf ? (
                    <iframe
                      src={signedProofUrl}
                      title="Vista del comprobante"
                      className={styles.proofIframe}
                    />
                  ) : (
                    <img
                      src={signedProofUrl}
                      alt={`Comprobante de orden ${order.reference}`}
                      className={styles.proofImage}
                    />
                  )}

                  {signedProofUrl && !isPurged && (
                    <div className={styles.proofToolbar}>
                      <span>El comprobante estará disponible durante 15 minutos.</span>
                      <a
                        href={signedProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.proofOpenLink}
                      >
                        <ExternalLink size={13} />
                        Ver comprobante en tamaño original
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className={styles.modalFooter}>
          <div className={styles.footerStatusText}>
            {order.status === 'pending_verification' ? (
              !allowPaymentActions ? (
                <span className={styles.centralizedNoticeText}>
                  <strong>Este pago se revisa desde la sección Comprobantes.</strong> Para aprobarlo o rechazarlo, abre allí este pedido.
                </span>
              ) : (
                <span>Este pedido tiene un comprobante adjunto y requiere revisión manual.</span>
              )
            ) : order.status === 'pending' ? (
              <span>â³ Reserva temporal ({reservationMinutes} min): en espera de que el comprador suba su comprobante.</span>
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
                <span>Crear comprobante digital</span>
              </button>
            )}

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
            >
              Cerrar
            </button>

            {order.status === 'pending_verification' && !allowPaymentActions && (
              <Link
                to={`/admin/comprobantes?ref=${encodeURIComponent(order.reference)}`}
                onClick={onClose}
                className={styles.btnPrimary}
                title="Abrir la sección Comprobantes para revisar el pago"
              >
                <Receipt size={16} />
                <span>Revisar en Comprobantes</span>
              </Link>
            )}

            {isPendingAction && (
              <>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => setIsRejectModalOpen(true)}
                >
                  <XCircle size={16} />
                  <span>Rechazar Pago</span>
                </button>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setIsConfirmApproveOpen(true)}
                >
                  <CheckCircle2 size={16} />
                  <span>Aprobar Pago</span>
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
        onSuccess={handleApproveSuccess}
        onClose={() => setIsConfirmApproveOpen(false)}
      />

      {/* Modal Guiado de Rechazo de Pago y Liberación de Boletos */}
      <AdminRejectPaymentModal
        isOpen={isRejectModalOpen}
        order={order}
        onSuccess={handleRejectSuccess}
        onClose={() => setIsRejectModalOpen(false)}
      />
    </div>
  );
};
