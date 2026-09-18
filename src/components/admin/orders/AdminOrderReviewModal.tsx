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

  const isPendingAction = order.status === 'pending_verification' || order.status === 'pending';

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
    if (!order) return;

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await approveOrderPayment(order.id);

      if (res.success) {
        setIsConfirmApproveOpen(false);
        setActionSuccess(
          `¡Pago aprobado! Se confirmaron definitivamente ${order.ticket_count} boletos como vendidos.`
        );

        // Despachar notificaciones centralizadas por WhatsApp
        const dispatchResult = await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: 'whatsapp',
          eventType: 'PAYMENT_APPROVED',
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
    if (!order) return;

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

        // Despachar notificaciones centralizadas por WhatsApp
        const dispatchResult = await dispatchOrderNotifications({
          orderId: order.id,
          contactPreference: 'whatsapp',
          eventType: 'PAYMENT_REJECTED',
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
        (order.status === 'paid' || order.status === 'completed'
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

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderTitle}>
            <ShieldCheck size={24} color="#f59e0b" />
            <div>
              <h2 className={styles.modalTitleText}>Revisión Administrativa de Orden</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9cb5ab)' }}>
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
          <div
            style={{
              margin: '1rem 1.75rem 0 1.75rem',
              padding: '0.85rem 1.25rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: 'var(--radius-md, 10px)',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
            <AlertTriangle size={18} />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              margin: '1rem 1.75rem 0 1.75rem',
              padding: '0.85rem 1.25rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              borderRadius: 'var(--radius-md, 10px)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className={styles.infoValueMono}>{order.reference}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.reference, 'ref')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9cb5ab',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                    title="Copiar referencia"
                  >
                    {copiedKey === 'ref' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Fecha y Hora:</span>
                <span
                  className={styles.infoValue}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Calendar size={13} color="#9cb5ab" />
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
                  {(order.status === 'paid' || order.status === 'completed') && (
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
                    <span className={styles.badgeDanger} style={{ opacity: 0.7 }}>
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
                <span
                  className={styles.infoValue}
                  style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}
                >
                  {formatCOP(order.total_amount)}
                </span>
              </div>

              {order.rejection_reason && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.6rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#fca5a5',
                      textTransform: 'uppercase',
                    }}
                  >
                    Motivo de Rechazo:
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#fecaca' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className={styles.infoValue} style={{ letterSpacing: '0.05em' }}>
                    {maskDocumentId(order.buyers?.document_id)}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#5e7a6f' }}>(Protegido)</span>
                </div>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Teléfono Celular:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {order.buyers?.phone ? (
                    <>
                      <a
                        href={`https://wa.me/57${order.buyers.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#34d399',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 600,
                        }}
                        title="Contactar directamente por WhatsApp"
                      >
                        <Phone size={13} />
                        {order.buyers.phone}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.buyers!.phone, 'phone')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#9cb5ab',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                        title="Copiar teléfono"
                      >
                        {copiedKey === 'phone' ? (
                          <Check size={12} color="#10b981" />
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
                    style={{
                      color: '#9cb5ab',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.85rem',
                    }}
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
                      className={styles.badgeSuccess}
                      style={{
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Phone size={11} /> WhatsApp + <Mail size={11} /> Correo
                    </span>
                  )}
                  {order.contact_preference === 'whatsapp' && (
                    <span
                      className={styles.badgeInfo}
                      style={{
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Phone size={11} /> Solo WhatsApp
                    </span>
                  )}
                  {order.contact_preference === 'email' && (
                    <span
                      className={styles.badgeWarning}
                      style={{
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
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
                <span style={{ fontSize: '0.8rem', color: '#5e7a6f', padding: '0.5rem' }}>
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

            <div className={styles.sectionGrid} style={{ gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Método Reportado:</span>
                  <span className={styles.infoValue} style={{ textTransform: 'capitalize' }}>
                    {order.payment_method || 'Transferencia Manual'}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Referencia Bancaria:</span>
                  <span className={styles.infoValueMono} style={{ fontSize: '0.9rem' }}>
                    {order.payment_gateway_id || 'No especificada'}
                  </span>
                </div>

                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#f59e0b',
                      marginBottom: '0.2rem',
                    }}
                  >
                    Regla de Verificación Manual:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#9cb5ab', lineHeight: 1.4 }}>
                    Verifique en la app bancaria correspondiente que los{' '}
                    <strong>{formatCOP(order.total_amount)}</strong> hayan ingresado efectivamente
                    antes de aprobar la orden.
                  </p>
                </div>
              </div>

              {/* Visor Seguro del Comprobante */}
              <div>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#9cb5ab',
                    marginBottom: '0.4rem',
                    fontWeight: 600,
                  }}
                >
                  Soporte Adjunto (Acceso Seguro Temporal 15 min):
                </span>

                <div className={styles.proofViewerContainer}>
                  {isLoadingProof ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#9cb5ab' }}>
                      <Clock size={24} style={{ display: 'block', margin: '0 auto 0.5rem auto' }} />
                      <span style={{ fontSize: '0.8rem' }}>Generando acceso seguro privado...</span>
                    </div>
                  ) : proofError || !signedProofUrl ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
                      <FileText
                        size={28}
                        style={{ display: 'block', margin: '0 auto 0.5rem auto' }}
                      />
                      <span style={{ fontSize: '0.8rem' }}>
                        {proofError || 'Sin archivo de comprobante adjunto'}
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
                        style={{
                          color: '#34d399',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 600,
                        }}
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
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <h4
                  style={{
                    margin: 0,
                    color: '#fca5a5',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <XCircle size={18} />
                  Indicar Motivo de Rechazo (Obligatorio)
                </h4>
                <button
                  type="button"
                  onClick={() => setShowRejectionForm(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9cb5ab',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Cancelar Rechazo
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.8rem', color: '#9cb5ab' }}>
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
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#e2f0ea',
                    marginBottom: '0.35rem',
                  }}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
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
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <strong
                  style={{
                    color: preparedNotification.type === 'payment_approved' ? '#34d399' : '#fca5a5',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <MessageSquare size={16} />
                  {preparedNotification.title}
                </strong>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => handleCopy(preparedNotification.messageText, 'notif')}
                >
                  {copiedKey === 'notif' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copiedKey === 'notif' ? 'Copiado' : 'Copiar Texto'}</span>
                </button>
              </div>

              <div className={styles.notificationMessagePreview}>
                {preparedNotification.messageText}
              </div>

              {preparedNotification.whatsAppLink ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
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
                <span style={{ fontSize: '0.75rem', color: '#9cb5ab' }}>
                  * El comprador no registró teléfono para enlace directo de WhatsApp.
                </span>
              )}
            </div>
          )}

          {/* 5. Trazabilidad de Notificaciones (WhatsApp) */}
          <div className={styles.reviewCard} style={{ borderLeft: '4px solid #34d399' }}>
            <div className={styles.reviewCardHeader}>
              <Send size={16} color="#34d399" />
              <span className={styles.reviewCardHeaderTitle}>
                5. Trazabilidad de Notificaciones (WhatsApp)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Resumen de Canales Registrados */}
              <div className={styles.sectionGrid} style={{ gap: '0.75rem' }}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>📱 Destino WhatsApp:</span>
                  <span className={styles.infoValue} style={{ color: '#34d399' }}>
                    {order.buyers?.phone || 'Sin celular registrado'}
                  </span>
                </div>
              </div>

              {/* Alerta si alguna notificación falló y requiere reintento */}
              {notificationLogs.some((l) => l.status === 'failed') && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: 'var(--radius-sm, 8px)',
                    color: '#fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.825rem',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>⚠️ Requiere Reintento:</strong> Se detectaron notificaciones que
                    fallaron en su entrega. Puedes reintentar el envío con los botones de acción
                    correspondientes.
                  </div>
                </div>
              )}

              {/* Historial detallado de notificaciones */}
              {notificationLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#9cb5ab',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
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
                        style={{
                          padding: '0.75rem 0.9rem',
                          backgroundColor: isFailed
                            ? 'rgba(239, 68, 68, 0.08)'
                            : 'rgba(0, 0, 0, 0.35)',
                          borderRadius: 'var(--radius-md, 8px)',
                          border: `1px solid ${
                            isFailed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(156, 181, 171, 0.15)'
                          }`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: isWhatsApp
                                  ? 'rgba(37, 211, 102, 0.15)'
                                  : 'rgba(96, 165, 250, 0.15)',
                                color: isWhatsApp ? '#34d399' : '#60a5fa',
                                border: `1px solid ${isWhatsApp ? 'rgba(37, 211, 102, 0.3)' : 'rgba(96, 165, 250, 0.3)'}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              {isWhatsApp ? <Phone size={11} /> : <Mail size={11} />}
                              {isWhatsApp ? 'WhatsApp' : 'Correo'}
                            </span>

                            <strong style={{ color: '#f3f7f5', fontSize: '0.85rem' }}>
                              {eventLabel}
                            </strong>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isSent && (
                              <span className={styles.badgeSuccess} style={{ fontSize: '0.7rem' }}>
                                <CheckCircle2 size={12} /> Enviada
                              </span>
                            )}
                            {isFailed && (
                              <span className={styles.badgeDanger} style={{ fontSize: '0.7rem' }}>
                                <XCircle size={12} /> Falló
                              </span>
                            )}
                            {isPending && (
                              <span className={styles.badgeWarning} style={{ fontSize: '0.7rem' }}>
                                <Clock size={12} /> Pendiente
                              </span>
                            )}

                            <span style={{ fontSize: '0.7rem', color: '#9cb5ab' }}>
                              {log.attempts} {log.attempts === 1 ? 'intento' : 'intentos'}
                            </span>
                          </div>
                        </div>

                        {/* Metadatos: Destinatario y Fecha */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            color: '#9cb5ab',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                          }}
                        >
                          <span>
                            <strong>Destinatario:</strong> {log.recipient}
                          </span>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
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
                            style={{
                              marginTop: '0.2rem',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#fca5a5',
                              fontSize: '0.75rem',
                            }}
                          >
                            <strong>Causa del error:</strong> {log.error_message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#9cb5ab' }}>
                  Las notificaciones transaccionales se disparan automáticamente y quedan
                  registradas al enviar comprobantes, aprobar o rechazar pagos.
                </p>
              )}

              {/* Mensaje de resultado de reintento */}
              {notifActionResult && (
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm, 6px)',
                    backgroundColor:
                      notifActionResult.startsWith('¡') || notifActionResult.includes('abierto')
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                    color:
                      notifActionResult.startsWith('¡') || notifActionResult.includes('abierto')
                        ? '#34d399'
                        : '#fbbf24',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <AlertCircle size={15} />
                  <span>{notifActionResult}</span>
                </div>
              )}

              {/* Acciones de Reintento Administrativo */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  marginTop: '0.35rem',
                }}
              >
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => void handleRetryWhatsAppNotification()}
                  disabled={isRetryingNotif || !order.buyers?.phone}
                  title="Abrir WhatsApp oficial para enviar o reenviar confirmación"
                >
                  <Phone size={13} color="#25d366" />
                  <span>Reenviar por WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className={styles.modalFooter}>
          <div style={{ fontSize: '0.8rem', color: '#9cb5ab' }}>
            {isPendingAction ? (
              <span>⚠️ La orden requiere verificación manual del comprobante.</span>
            ) : (
              <span>
                Orden en estado <strong>{order.status}</strong>.
              </span>
            )}
          </div>

          <div className={styles.footerActions}>
            {(order.status === 'paid' || order.status === 'completed') && (
              <button
                type="button"
                className={styles.btnSecondary}
                style={{
                  borderColor: 'var(--color-brand-accent, #f59e0b)',
                  color: 'var(--color-brand-accent, #f59e0b)',
                }}
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

      {(order.status === 'paid' || order.status === 'completed') && isReceiptModalOpen && (
        <DigitalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          receiptData={{
            orderReference: order.reference,
            orderStatus: order.status === 'completed' ? 'completed' : 'paid',
            createdAt: order.created_at,
            totalAmount: order.total_amount,
            ticketCount: order.tickets?.length || 0,
            buyerName: order.buyers?.full_name || 'Comprador',
            buyerDocumentMasked: order.buyers?.document_id
              ? maskDocumentId(order.buyers.document_id)
              : '***',
            raffleTitle: 'Sorteo Oficial Manaure Vive',
            lotteryReference: 'Lotería Oficial según cronograma',
            ticketNumbers: (order.tickets || []).map((t) => t.number),
          }}
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
