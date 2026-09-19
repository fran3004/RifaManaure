import React, { useState, useEffect, useRef } from 'react';
import { useTicketCart } from '@/context/useTicketCart';
import {
  X,
  ShieldCheck,
  CreditCard,
  QrCode,
  CheckCircle2,
  Clock,
  MessageCircle,
  AlertCircle,
  Copy,
  Check,
  FileImage,
  FileText,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Receipt,
  Calendar,
  Building2,
  Hash,
  Bell,
  Search,
} from 'lucide-react';
import { formatCOP, isValidDocument, isValidPhone, isValidEmail } from '@/lib/utils';
import { createOrder } from '@/services/ticketService';
import {
  getPaymentAccounts,
  uploadPaymentProof,
  validateProofFile,
} from '@/services/paymentService';
import { generateOrderNotification } from '@/services/notificationService';
import type { PaymentAccountRow, ContactPreference } from '@/types/raffle.types';
import styles from './ModalCheckout.module.css';

type CheckoutStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_TITLES: Record<CheckoutStepNumber, string> = {
  1: 'Datos del Comprador',
  2: 'Resumen de Números',
  3: 'Total a Pagar',
  4: 'Cuentas Disponibles',
  5: 'Instrucciones de Transferencia',
  6: 'Subir Comprobante',
  7: 'Confirmación',
};

function formatAccountType(type?: string | null): string {
  if (!type) return 'Cuenta Bancaria';
  switch (type.toLowerCase()) {
    case 'digital_wallet':
      return 'Billetera Digital';
    case 'savings':
      return 'Cuenta de Ahorros';
    case 'current':
      return 'Cuenta Corriente';
    case 'bre_b':
    case 'breb':
      return 'Llave Bre-B';
    case 'transfiya':
      return 'Transfiya';
    case 'other':
      return 'Otro Método Manual';
    default:
      return type;
  }
}

function formatTicketNumber(num: string): string {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num;
  return n.toString().padStart(3, '0');
}

function formatOrderDateTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export const ModalCheckout: React.FC = () => {
  const {
    raffle,
    unitPrice,
    selectedTickets,
    totalAmount,
    isCheckoutOpen,
    closeCheckout,
    clearSelection,
    refreshTickets,
    systemSettings,
  } = useTicketCart();

  const reservationDurationMinutes = systemSettings?.reservation_duration_minutes || 10;

  // Flujo visual estricto de 7 pasos
  const [currentStep, setCurrentStep] = useState<CheckoutStepNumber>(1);
  const [isReserving, setIsReserving] = useState<boolean>(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState<boolean>(false);
  const [hasReservationError, setHasReservationError] = useState<boolean>(false);

  // Datos del Comprador (Paso 1)
  const [formData, setFormData] = useState<{
    fullName: string;
    documentId: string;
    phone: string;
    email: string;
    city: string;
    contactPreference: ContactPreference;
    acceptTerms: boolean;
  }>({
    fullName: '',
    documentId: '',
    phone: '',
    email: '',
    city: '',
    contactPreference: 'whatsapp',
    acceptTerms: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Información de la Orden y Reserva (Pasos 3 y 4)
  const [createdOrderId, setCreatedOrderId] = useState<string>('');
  const [createdBuyerId, setCreatedBuyerId] = useState<string>('');
  const [orderReference, setOrderReference] = useState<string>('');
  const [orderCreatedAt, setOrderCreatedAt] = useState<Date>(new Date());
  const [confirmedTickets, setConfirmedTickets] = useState<string[]>([]);
  const [confirmedTotalAmount, setConfirmedTotalAmount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(600); // 10 minutos

  // Cuentas de Pago y Método Seleccionado (Paso 4)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedPaymentMethodName, setSelectedPaymentMethodName] =
    useState<string>('Transferencia Manual');

  // Subida de Comprobante (Paso 6)
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [paymentReferenceInput, setPaymentReferenceInput] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClose = () => {
    if (currentStep === 7) {
      setCurrentStep(1);
      setCreatedOrderId('');
      setCreatedBuyerId('');
      setOrderReference('');
      setConfirmedTotalAmount(0);
      setReceiptFile(null);
      setReceiptPreview(null);
      setHasReservationError(false);
    }
    closeCheckout();
  };

  // Cargar cuentas oficiales de recaudo
  useEffect(() => {
    if (!isCheckoutOpen) return;

    let isMounted = true;
    void getPaymentAccounts().then((accounts) => {
      if (isMounted) {
        setPaymentAccounts(accounts);
        if (accounts.length > 0) {
          setSelectedAccountId((prev) => prev ?? accounts[0].id);
          setSelectedPaymentMethodName((prev) =>
            prev === 'Transferencia Manual'
              ? `Transferencia Manual (${accounts[0].bank_name})`
              : prev
          );
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isCheckoutOpen]);

  // Temporizador de expiración de reserva temporal (10 minutos) entre los pasos 4 y 6
  useEffect(() => {
    if (currentStep < 4 || currentStep > 6 || timeLeftSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHasReservationError(true);
          setErrorMessage(
            `El tiempo de reserva de tus boletos (${reservationDurationMinutes} minutos) ha expirado. Por favor selecciona nuevamente tus números.`
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentStep, timeLeftSeconds, reservationDurationMinutes]);

  if (!isCheckoutOpen) return null;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim() || formData.fullName.trim().length < 3) {
      newErrors.fullName = 'Ingresa tu nombre completo.';
    }
    if (!isValidDocument(formData.documentId)) {
      newErrors.documentId = 'Cédula o documento no válido (6 a 11 dígitos).';
    }
    if (!isValidPhone(formData.phone)) {
      newErrors.phone = 'Celular inválido (10 dígitos comenzando con 3).';
    }
    if (!isValidEmail(formData.email)) {
      newErrors.email = 'Correo electrónico no válido.';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'Ingresa tu ciudad de residencia.';
    }
    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'Debes aceptar los términos y condiciones.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // PASO 1 -> PASO 2: Validar datos del comprador y avanzar al resumen de números
  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setCurrentStep(2);
    }
  };

  // PASO 3 -> PASO 4: Confirmar orden segura y atómica en PostgreSQL y avanzar a cuentas disponibles
  const handleConfirmReservation = async () => {
    if (!raffle || selectedTickets.length === 0) return;

    setIsReserving(true);
    setErrorMessage('');

    try {
      // Crear orden segura en PostgreSQL (recalcula total_amount internamente y reserva con FOR UPDATE)
      const orderResult = await createOrder(
        raffle.id,
        {
          fullName: formData.fullName,
          documentId: formData.documentId,
          phone: formData.phone,
          email: formData.email,
          city: formData.city,
        },
        selectedTickets,
        undefined, // Total calculado exclusivamente en el servidor
        'transfer_manual',
        formData.contactPreference
      );

      if (!orderResult.success || !orderResult.reference || !orderResult.orderId) {
        throw new Error(orderResult.error || 'Error al generar la orden de compra.');
      }

      setCreatedOrderId(orderResult.orderId);
      setCreatedBuyerId(orderResult.buyerId || '');
      setOrderReference(orderResult.reference);
      setOrderCreatedAt(new Date());
      setConfirmedTickets([...selectedTickets]);
      setConfirmedTotalAmount(
        orderResult.totalAmount ||
          (raffle?.ticket_price ? raffle.ticket_price * selectedTickets.length : totalAmount)
      );
      if (orderResult.reservationExpiresAt) {
        const expiresMs = new Date(orderResult.reservationExpiresAt).getTime();
        const diffSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
        setTimeLeftSeconds(diffSecs);
      } else {
        setTimeLeftSeconds(reservationDurationMinutes * 60);
      }
      setCurrentStep(4);
      void refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al generar la reserva';
      setErrorMessage(msg);
      setHasReservationError(true);
    } finally {
      setIsReserving(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Manejo de subida y validación del comprobante (Paso 6)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProofFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Archivo de comprobante no válido.');
      setReceiptFile(null);
      setReceiptPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setErrorMessage('');
    setReceiptFile(file);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setReceiptPreview('PDF_DOCUMENT');
    } else {
      const previewUrl = URL.createObjectURL(file);
      setReceiptPreview(previewUrl);
    }
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // PASO 6 -> PASO 7: Enviar soporte a almacenamiento privado y pasar a confirmación
  const handleSubmitProof = async () => {
    if (!receiptFile || !createdOrderId || !raffle) {
      alert('Por favor selecciona el archivo de tu comprobante de pago.');
      return;
    }

    setIsSubmittingProof(true);
    setErrorMessage('');

    try {
      const uploadRes = await uploadPaymentProof(
        receiptFile,
        createdOrderId,
        raffle.id,
        createdBuyerId,
        paymentReferenceInput.trim() || undefined
      );

      if (!uploadRes.success) {
        throw new Error(uploadRes.error || 'No se pudo procesar el comprobante de pago.');
      }

      // Transición exitosa a confirmación definitiva (Paso 7)
      setCurrentStep(7);
      clearSelection();
      void refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el comprobante.';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingProof(false);
    }
  };

  // Generación desacoplada de notificación para WhatsApp
  const supportPhone =
    systemSettings?.support_whatsapp_number ||
    import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER ||
    '573001234567';
  const receiptNotification = generateOrderNotification('receipt_received', {
    reference: orderReference,
    buyerName: formData.fullName,
    buyerPhone: supportPhone,
    buyerEmail: formData.email,
    ticketNumbers: confirmedTickets.length > 0 ? confirmedTickets : selectedTickets,
    totalAmount,
    raffleTitle: raffle?.title,
  });
  const whatsappUrl = receiptNotification.whatsAppLink;

  return (
    <div className={styles.modalBackdrop} onClick={handleClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Barra Superior del Modal */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBox}>
            <ShieldCheck size={22} className={styles.shieldIcon} />
            <div>
              <h3 className={styles.modalTitle}>Checkout Seguro</h3>
              <span className={styles.modalSub}>Gran Rifa Ecoturística Manaure Vive</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeBtn}
            aria-label="Cerrar ventana de compra"
          >
            <X size={20} />
          </button>
        </div>

        {/* Indicador Visual de Progreso (Paso X de 7) */}
        {!hasReservationError && (
          <div className={styles.stepperBar}>
            <div className={styles.stepperProgressTrack}>
              <div
                className={styles.stepperProgressFill}
                style={{ width: `${(currentStep / 7) * 100}%` }}
              />
            </div>
            <div className={styles.stepperInfo}>
              <span className={styles.stepperBadge}>Paso {currentStep} de 7</span>
              <span className={styles.stepperTitle}>{STEP_TITLES[currentStep]}</span>
            </div>
          </div>
        )}

        {/* Resumen rápido de Boletos y Total en tira */}
        {!hasReservationError && currentStep !== 7 && (
          <div className={styles.orderSummaryStrip}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>
                Boletos (
                {confirmedTickets.length > 0 ? confirmedTickets.length : selectedTickets.length}):
              </span>
              <div className={styles.summaryTags}>
                {(confirmedTickets.length > 0 ? confirmedTickets : selectedTickets).map((num) => (
                  <span key={num} className={styles.summaryTag}>
                    {formatTicketNumber(num)}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.summaryTotalBox}>
              <span className={styles.summaryLabel}>Total:</span>
              <strong className={styles.summaryTotalAmount}>{formatCOP(totalAmount)}</strong>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO: ERROR DE RESERVA O EXPIRACIÓN                                      */}
        {/* ========================================================================= */}
        {hasReservationError && (
          <div className={styles.errorState}>
            <AlertCircle size={48} className={styles.errorBigIcon} />
            <h4 style={{ color: '#f3f7f5', margin: 0 }}>No pudimos completar la reserva</h4>
            <p style={{ color: '#9cb5ab', margin: 0 }}>
              {errorMessage || 'Ocurrió un problema temporal al procesar tus boletos.'}
            </p>
            <div className={styles.errorActions}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={() => {
                  setHasReservationError(false);
                  setCurrentStep(1);
                }}
              >
                Intentar de nuevo
              </button>
              <button type="button" className={styles.cancelBtn} onClick={handleClose}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 1: DATOS DEL COMPRADOR                                              */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 1 && (
          <form onSubmit={handleStep1Submit} className={styles.formContent}>
            <h4 className={styles.sectionHeader}>Ingresa tus Datos Personales</h4>

            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label htmlFor="fullName" className={styles.label}>
                  Nombre Completo *
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Ej: Juan Camilo Pérez"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className={`${styles.input} ${errors.fullName ? styles.inputError : ''}`}
                />
                {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="documentId" className={styles.label}>
                  Cédula / Documento *
                </label>
                <input
                  id="documentId"
                  name="documentId"
                  type="text"
                  placeholder="Ej: 1065892340"
                  value={formData.documentId}
                  onChange={handleInputChange}
                  className={`${styles.input} ${errors.documentId ? styles.inputError : ''}`}
                  maxLength={12}
                />
                {errors.documentId && <span className={styles.errorText}>{errors.documentId}</span>}
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="phone" className={styles.label}>
                  Celular WhatsApp *
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Ej: 3001234567"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
                  maxLength={10}
                />
                {errors.phone && <span className={styles.errorText}>{errors.phone}</span>}
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="email" className={styles.label}>
                  Correo Electrónico *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Ej: juan.perez@gmail.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                />
                {errors.email && <span className={styles.errorText}>{errors.email}</span>}
              </div>

              <div className={`${styles.inputGroup} ${styles.inputFull}`}>
                <label htmlFor="city" className={styles.label}>
                  Ciudad / Municipio *
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  placeholder="Ej: Valledupar, Cesar"
                  value={formData.city}
                  onChange={handleInputChange}
                  className={`${styles.input} ${errors.city ? styles.inputError : ''}`}
                />
                {errors.city && <span className={styles.errorText}>{errors.city}</span>}
              </div>
            </div>

            {/* Canal Oficial de Notificación */}
            <div className={styles.contactPreferenceContainer}>
              <label className={styles.contactPreferenceTitle}>
                <Bell size={15} color="#f59e0b" />
                Canal oficial de confirmación
              </label>
              <div className={styles.contactPreferenceGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div
                  className={`${styles.contactOptionCard} ${styles.contactOptionCardSelected}`}
                  style={{ cursor: 'default' }}
                >
                  <MessageCircle size={20} className={styles.contactOptionIcon} />
                  <span className={styles.contactOptionLabel}>
                    WhatsApp Oficial (Confirmación y enlace de verificación)
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.termsCheckbox}>
              <label className={styles.checkboxLabel}>
                <input
                  name="acceptTerms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={handleInputChange}
                />
                <span>
                  Acepto los términos del sorteo y autorizo el tratamiento de mis datos de contacto
                  para la entrega del premio.
                </span>
              </label>
              {errors.acceptTerms && <span className={styles.errorText}>{errors.acceptTerms}</span>}
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={handleClose} className={styles.btnBack}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnNext}>
                <span>Continuar a Resumen de Números</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* PASO 2: RESUMEN DE NÚMEROS                                               */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 2 && (
          <div className={styles.stepContent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4
                className={styles.sectionHeader}
                style={{ borderBottom: 'none', paddingBottom: 0 }}
              >
                Tus Números Seleccionados
              </h4>
              <span className={styles.stepperBadge}>
                {selectedTickets.length} {selectedTickets.length === 1 ? 'Boleto' : 'Boletos'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #9cb5ab)' }}>
              Verifica los números que vas a apartar para la Gran Rifa Ecoturística Manaure Vive:
            </p>

            <div className={styles.ticketsGridBig}>
              {selectedTickets.map((num) => (
                <div key={num} className={styles.ticketChipBig}>
                  <Ticket size={18} color="#f59e0b" style={{ marginBottom: '4px' }} />
                  <span className={styles.ticketChipNumber}>{formatTicketNumber(num)}</span>
                  <span className={styles.ticketChipLabel}>Boleto</span>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--bg-main, #0a1410)',
                borderRadius: 'var(--radius-md, 10px)',
                border: '1px solid rgba(156, 181, 171, 0.15)',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#9cb5ab', display: 'block' }}>
                Comprador:
              </span>
              <strong style={{ color: '#f3f7f5', fontSize: '0.9rem' }}>{formData.fullName}</strong>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: '#9cb5ab',
                  display: 'block',
                  marginTop: '0.2rem',
                }}
              >
                C.C. {formData.documentId} • Cel: {formData.phone}
              </span>
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={() => setCurrentStep(1)} className={styles.btnBack}>
                <ChevronLeft size={18} />
                <span>Atrás: Datos</span>
              </button>
              <button type="button" onClick={() => setCurrentStep(3)} className={styles.btnNext}>
                <span>Continuar a Total a Pagar</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 3: TOTAL A PAGAR                                                    */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 3 && (
          <div className={styles.stepContent}>
            <h4 className={styles.sectionHeader}>Detalle y Total de la Compra</h4>

            <div className={styles.pricingCard}>
              <div className={styles.pricingRow}>
                <span>Rifa:</span>
                <strong>{raffle?.title || 'Gran Rifa Ecoturística Manaure Vive'}</strong>
              </div>

              <div className={styles.pricingRow}>
                <span>Cantidad de Boletos:</span>
                <strong>{selectedTickets.length}</strong>
              </div>

              <div className={styles.pricingRow}>
                <span>Valor Unitario por Boleto:</span>
                <strong>{formatCOP(unitPrice || raffle?.ticket_price || 0)}</strong>
              </div>

              <div className={styles.pricingRow}>
                <span>Método de Pago:</span>
                <strong style={{ color: '#f59e0b' }}>Transferencia Manual Directa</strong>
              </div>

              <div className={styles.pricingDivider} />

              <div className={styles.pricingTotalRow}>
                <strong>Total a Pagar:</strong>
                <span className={styles.pricingTotalVal}>{formatCOP(totalAmount)}</span>
              </div>
            </div>

            <div className={styles.reservationNotice}>
              <Clock size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', color: '#f3f7f5', marginBottom: '0.2rem' }}>
                  Bloqueo atómico de números:
                </strong>
                Al hacer clic en el botón a continuación, tus números quedarán asegurados y
                bloqueados por 10 minutos exclusivamente a tu nombre para que realices tu
                transferencia bancaria.
              </div>
            </div>

            <div className={styles.stepNavigation}>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className={styles.btnBack}
                disabled={isReserving}
              >
                <ChevronLeft size={18} />
                <span>Atrás: Números</span>
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmReservation()}
                className={styles.btnNext}
                disabled={isReserving}
              >
                {isReserving ? (
                  <>
                    <div className={styles.spinner} style={{ width: 16, height: 16 }} />
                    <span>Reservando en Base de Datos...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar Reserva y Ver Cuentas</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 4: CUENTAS DISPONIBLES                                              */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 4 && (
          <div className={styles.stepContent}>
            {/* Banner de Reserva Exitosa */}
            <div className={styles.timerBanner}>
              <Clock size={20} className={styles.timerIcon} />
              <div>
                <strong>Boletos Reservados: {formatTimer(timeLeftSeconds)}</strong>
                <p>
                  Cuentas oficiales para realizar tu transferencia antes de que termine el tiempo.
                </p>
              </div>
            </div>

            {/* Referencia Oficial de Orden */}
            <div className={styles.referenceCard}>
              <span className={styles.refLabel}>Referencia de Pago de tu Orden:</span>
              <div className={styles.refRow}>
                <strong className={styles.refCode}>{orderReference}</strong>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => copyToClipboard(orderReference, 'ref')}
                >
                  {copiedKey === 'ref' ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedKey === 'ref' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Cuentas de Transferencia */}
            <div className={styles.bankAccounts}>
              <h5 className={styles.bankTitle}>
                <QrCode size={18} color="var(--color-brand-accent, #f59e0b)" />
                Realiza tu pago mediante una de las siguientes opciones.
              </h5>

              {paymentAccounts.length === 0 ? (
                <div className={styles.emptyAccountsNotice}>
                  <AlertCircle
                    size={20}
                    color="#f59e0b"
                    style={{ flexShrink: 0, marginTop: '2px' }}
                  />
                  <div>
                    <strong style={{ display: 'block', color: '#f3f7f5', fontSize: '0.9rem' }}>
                      No hay cuentas de pago activas en este momento.
                    </strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#9cb5ab' }}>
                      Por favor comunícate con el soporte oficial de Manaure Vive para
                      instrucciones.
                    </p>
                  </div>
                </div>
              ) : (
                paymentAccounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <div
                      key={acc.id}
                      className={`${styles.accountOptionCard} ${isSelected ? styles.accountOptionCardSelected : ''}`}
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setSelectedPaymentMethodName(`Transferencia Manual (${acc.bank_name})`);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Entidad y Tipo */}
                      <div className={styles.accountOptionHeader}>
                        <div className={styles.accountEntityRow}>
                          <CreditCard size={18} className={styles.accountIcon} />
                          <span className={styles.accountEntityName}>{acc.bank_name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isSelected && (
                            <span className={styles.selectAccountBadge}>
                              <Check size={12} /> Seleccionada
                            </span>
                          )}
                          <span className={styles.accountTypeBadge}>
                            {formatAccountType(acc.account_type)}
                          </span>
                        </div>
                      </div>

                      {/* Número de Cuenta y Botón Copiar */}
                      <div className={styles.accountNumberRow}>
                        <div className={styles.accountNumberBlock}>
                          <span className={styles.fieldLabel}>Número de Cuenta / Teléfono:</span>
                          <strong className={styles.accountNumberVal}>{acc.account_number}</strong>
                        </div>
                        <button
                          type="button"
                          className={styles.copyNumberBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(acc.account_number.replace(/\s+/g, ''), acc.id);
                          }}
                          title="Copiar número de cuenta"
                        >
                          {copiedKey === acc.id ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedKey === acc.id ? 'Copiado' : 'Copiar número'}</span>
                        </button>
                      </div>

                      {/* Titular e Instrucciones */}
                      <div className={styles.accountDetailsRow}>
                        <span className={styles.accountHolderText}>
                          <strong>Titular:</strong> {acc.account_holder}
                          {acc.holder_document_id && (
                            <span className={styles.accountDocText}>
                              {' '}
                              • Doc: {acc.holder_document_id}
                            </span>
                          )}
                        </span>
                        {acc.instructions && (
                          <p className={styles.accountInstructionsText}>
                            <strong>Instrucciones:</strong> {acc.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={() => setCurrentStep(3)} className={styles.btnBack}>
                <ChevronLeft size={18} />
                <span>Atrás: Total</span>
              </button>

              <button type="button" onClick={() => setCurrentStep(5)} className={styles.btnNext}>
                <span>Continuar a Instrucciones</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 5: INSTRUCCIONES DE TRANSFERENCIA                                    */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 5 && (
          <div className={styles.stepContent}>
            <h4 className={styles.sectionHeader}>Instrucciones de Transferencia</h4>

            <div className={styles.instructionsList}>
              <div className={styles.instructionItem}>
                <div className={styles.instructionNumber}>1</div>
                <div className={styles.instructionBody}>
                  <h5 className={styles.instructionHeading}>Abre tu aplicación bancaria</h5>
                  <p className={styles.instructionText}>
                    Ingresa a Bancolombia, Nequi, Daviplata o la plataforma de tu elección fuera de
                    esta página.
                  </p>
                </div>
              </div>

              <div className={styles.instructionItem}>
                <div className={styles.instructionNumber}>2</div>
                <div className={styles.instructionBody}>
                  <h5 className={styles.instructionHeading}>
                    Transfiere el monto exacto:{' '}
                    <strong style={{ color: '#f59e0b' }}>{formatCOP(totalAmount)}</strong>
                  </h5>
                  <p className={styles.instructionText}>
                    Asegúrate de enviar la cifra precisa correspondiente a tus{' '}
                    {confirmedTickets.length} boletos.
                  </p>
                </div>
              </div>

              <div className={styles.instructionItem}>
                <div className={styles.instructionNumber}>3</div>
                <div className={styles.instructionBody}>
                  <h5 className={styles.instructionHeading}>
                    Indica tu Referencia:{' '}
                    <strong style={{ color: '#f59e0b' }}>{orderReference}</strong>
                  </h5>
                  <p className={styles.instructionText}>
                    Escribe este código en el campo de concepto, mensaje o descripción de la
                    transferencia.
                  </p>
                </div>
              </div>

              <div className={styles.instructionItem}>
                <div className={styles.instructionNumber}>4</div>
                <div className={styles.instructionBody}>
                  <h5 className={styles.instructionHeading}>
                    Toma captura o guarda el comprobante
                  </h5>
                  <p className={styles.instructionText}>
                    La imagen debe ser nítida y mostrar claramente la fecha, valor y número de
                    aprobación/transacción.
                  </p>
                </div>
              </div>

              <div className={styles.instructionItem}>
                <div className={styles.instructionNumber}>5</div>
                <div className={styles.instructionBody}>
                  <h5 className={styles.instructionHeading}>
                    Adjunta tu comprobante en el siguiente paso
                  </h5>
                  <p className={styles.instructionText}>
                    Subirás la imagen (JPG, PNG, WEBP) o PDF para que nuestro equipo lo verifique
                    manualmente.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={() => setCurrentStep(4)} className={styles.btnBack}>
                <ChevronLeft size={18} />
                <span>Atrás: Cuentas</span>
              </button>

              <button type="button" onClick={() => setCurrentStep(6)} className={styles.btnNext}>
                <span>Proceder a Subir Comprobante</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 6: SUBIR COMPROBANTE                                                 */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 6 && (
          <div className={styles.stepContent}>
            <h4 className={styles.sectionHeader}>Subir Comprobante de Pago</h4>

            <div className={styles.receiptUploadSection}>
              {!receiptPreview ? (
                <div className={styles.dropzone} onClick={() => fileInputRef.current?.click()}>
                  <FileImage size={32} color="#9cb5ab" />
                  <p className={styles.dropzoneText}>
                    Haz clic aquí para seleccionar tu comprobante
                  </p>
                  <span className={styles.dropzoneSub}>
                    Formatos permitidos: JPG, PNG, WEBP o PDF (Máx. 5 MB)
                  </span>
                </div>
              ) : (
                <div className={styles.previewContainer}>
                  <div className={styles.previewInfo}>
                    {receiptPreview === 'PDF_DOCUMENT' ? (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#1a332a',
                          borderRadius: 6,
                          border: '1px solid rgba(156, 181, 171, 0.2)',
                        }}
                      >
                        <FileText size={24} color="#f59e0b" />
                      </div>
                    ) : (
                      <img
                        src={receiptPreview}
                        alt="Vista previa del comprobante"
                        className={styles.previewImg}
                      />
                    )}
                    <div>
                      <span className={styles.previewName}>{receiptFile?.name}</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#9cb5ab' }}>
                        {(Number(receiptFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.removeImgBtn}
                    onClick={handleRemoveReceipt}
                    title="Eliminar y seleccionar otro comprobante"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleFileChange}
              />

              <div style={{ marginTop: '0.5rem' }}>
                <label
                  htmlFor="refInput"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #9cb5ab)',
                    marginBottom: '0.3rem',
                  }}
                >
                  Número de Aprobación / Referencia Bancaria (Opcional):
                </label>
                <input
                  id="refInput"
                  type="text"
                  placeholder="Ej: 987654321 o CUS / Código de transferencia"
                  value={paymentReferenceInput}
                  onChange={(e) => setPaymentReferenceInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: 'var(--bg-main, #0a1410)',
                    border: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.2))',
                    borderRadius: 'var(--radius-md, 10px)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              {errorMessage && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <div className={styles.stepNavigation}>
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className={styles.btnBack}
                disabled={isSubmittingProof}
              >
                <ChevronLeft size={18} />
                <span>Atrás: Instrucciones</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSubmitProof()}
                className={styles.btnNext}
                disabled={!receiptFile || isSubmittingProof}
              >
                {isSubmittingProof ? (
                  <>
                    <div className={styles.spinner} style={{ width: 16, height: 16 }} />
                    <span>Enviando Comprobante...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Confirmar y Enviar Comprobante</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 7: CONFIRMACIÓN (PENDIENTE DE VERIFICACIÓN)                          */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 7 && (
          <div className={styles.successState}>
            <div className={styles.successIconWrapper}>
              <CheckCircle2 size={42} />
            </div>

            {/* Mensajes explícitos requeridos */}
            <h4 className={styles.successTitle}>Tu pedido ha sido recibido.</h4>

            <span className={styles.statusBadgePending}>
              <Clock size={14} />
              Pendiente de verificación
            </span>

            <div className={styles.confirmationNoticeBanner}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>Tu pago será verificado manualmente.</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#fef3c7' }}>
                  Recibirás confirmación por WhatsApp o correo electrónico una vez validada la
                  transferencia.
                </p>
              </div>
            </div>

            {/* Tabla resumen con los 6 datos solicitados */}
            <div className={styles.confirmationTableCard}>
              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Hash
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Número de Orden:
                </span>
                <span className={styles.confirmationTableVal}>
                  <strong
                    style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: '1.05rem' }}
                  >
                    {orderReference}
                  </strong>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(orderReference, 'confirm_ref')}
                    className={styles.copyBtn}
                    style={{ marginLeft: '8px', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    {copiedKey === 'confirm_ref' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedKey === 'confirm_ref' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Ticket
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Números Seleccionados:
                </span>
                <span className={styles.confirmationTableVal}>
                  {confirmedTickets.map((num) => (
                    <span
                      key={num}
                      style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.4rem',
                        margin: '0 2px',
                        backgroundColor: '#1a332a',
                        border: '1px solid #f59e0b',
                        borderRadius: '4px',
                        color: '#f59e0b',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      {formatTicketNumber(num)}
                    </span>
                  ))}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Receipt
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Total Liquidado:
                </span>
                <span
                  className={styles.confirmationTableVal}
                  style={{ fontSize: '1.1rem', color: '#10b981' }}
                >
                  {formatCOP(confirmedTotalAmount > 0 ? confirmedTotalAmount : totalAmount)}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Clock
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Estado de la Orden:
                </span>
                <span className={styles.confirmationTableVal}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      color: '#fbbf24',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                    }}
                  >
                    <Clock size={12} /> Pendiente de verificación
                  </span>
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Calendar
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Fecha y Hora:
                </span>
                <span className={styles.confirmationTableVal} style={{ fontSize: '0.8rem' }}>
                  {formatOrderDateTime(orderCreatedAt)}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Building2
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Método de Pago:
                </span>
                <span className={styles.confirmationTableVal} style={{ fontSize: '0.85rem' }}>
                  {selectedPaymentMethodName}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Bell
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                  />
                  Canal de Notificación:
                </span>
                <span
                  className={styles.confirmationTableVal}
                  style={{ fontSize: '0.85rem', color: '#34d399' }}
                >
                  📱 WhatsApp Oficial
                </span>
              </div>
            </div>

            <p className={styles.successMessage}>
              Tus boletos están asegurados y protegidos durante este proceso. Ningún otro usuario
              podrá tomarlos mientras nuestro equipo verifica tu comprobante.
            </p>

            <div className={styles.confirmationActions}>
              <div className={styles.confirmationActionsGrid}>
                <a href="/verificar" className={styles.btnActionPrimary}>
                  <Search size={16} />
                  <span>Consultar mis Boletos</span>
                </a>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnActionWhatsapp}
                >
                  <MessageCircle size={16} />
                  <span>Soporte por WhatsApp</span>
                </a>
              </div>

              <button type="button" className={styles.btnActionFinish} onClick={handleClose}>
                Finalizar y Salir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
