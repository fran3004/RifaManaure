import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTicketCart } from '@/context/useTicketCart';
import {
  X,
  ShieldCheck,
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
  Mail,
} from 'lucide-react';
import { formatCOP, isValidDocument, isValidPhone, isValidEmail } from '@/lib/utils';
import { createOrder } from '@/services/ticketService';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
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

export function formatContactPreferenceLabel(preference: ContactPreference): string {
  switch (preference) {
    case 'whatsapp':
      return '📱 WhatsApp (Gestión manual)';
    case 'email':
      return '✉️ Correo electrónico (Automático)';
    case 'both':
      return '📱 WhatsApp + ✉️ Correo (Respaldo total)';
    default:
      return '📱 WhatsApp Oficial';
  }
}

export interface ContactPreferenceOptionItem {
  id: ContactPreference;
  title: string;
  description: string;
  subtext: string;
  badge: string;
  badgeType: 'manual' | 'auto' | 'recommended';
  icon: typeof MessageCircle;
}

export const CONTACT_PREFERENCE_OPTIONS: ContactPreferenceOptionItem[] = [
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    description: 'Recibe la confirmación por WhatsApp.',
    subtext: 'El envío se gestiona actualmente de forma manual.',
    badge: 'Gestión manual',
    badgeType: 'manual',
    icon: MessageCircle,
  },
  {
    id: 'email',
    title: 'Correo electrónico',
    description: 'Recibe la confirmación automática por correo.',
    subtext:
      'El correo de confirmación se enviará automáticamente cuando nuestro equipo valide tu pago.',
    badge: 'Automático',
    badgeType: 'auto',
    icon: Mail,
  },
  {
    id: 'both',
    title: 'WhatsApp + Correo',
    description: 'Recibe la confirmación por ambos canales.',
    subtext:
      'El correo de confirmación se enviará automáticamente cuando nuestro equipo valide tu pago; WhatsApp se gestiona de forma manual.',
    badge: 'Recomendado',
    badgeType: 'recommended',
    icon: Bell,
  },
];

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
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ''
  );

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
    contactPreference: 'both',
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
  const [proofIdempotencyKey, setProofIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ''
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    if (currentStep === 7) {
      setCurrentStep(1);
      setCreatedOrderId('');
      setCreatedBuyerId('');
      setOrderReference('');
      setConfirmedTotalAmount(0);
      setReceiptFile(null);
      setReceiptPreview(null);
      setHasReservationError(false);
      setFormData((prev) => ({ ...prev, contactPreference: 'both' }));
      setIdempotencyKey(
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : ''
      );
    }
    closeCheckout();
  }, [currentStep, closeCheckout]);

  // Gestión de foco inicial, restauración al cerrar y bloqueo de scroll del body
  useEffect(() => {
    if (isCheckoutOpen) {
      triggerElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      const originalOverscrollBehavior = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      const timer = setTimeout(() => {
        if (modalCardRef.current) {
          const focusable = modalCardRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscrollBehavior;
        if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
          triggerElementRef.current.focus();
        }
      };
    }
  }, [isCheckoutOpen]);

  // Focus trap y cierre seguro con tecla Escape
  useEffect(() => {
    if (!isCheckoutOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isReserving && !isSubmittingProof) {
          e.preventDefault();
          handleClose();
        }
        return;
      }

      if (e.key === 'Tab' && modalCardRef.current) {
        const focusableElements = modalCardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCheckoutOpen, isReserving, isSubmittingProof, handleClose]);

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

  const handlePreferenceKeyDown = (
    e: React.KeyboardEvent,
    currentId: ContactPreference
  ) => {
    const currentIndex = CONTACT_PREFERENCE_OPTIONS.findIndex((opt) => opt.id === currentId);
    let nextIndex = -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % CONTACT_PREFERENCE_OPTIONS.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex =
        (currentIndex - 1 + CONTACT_PREFERENCE_OPTIONS.length) % CONTACT_PREFERENCE_OPTIONS.length;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFormData((prev) => ({ ...prev, contactPreference: currentId }));
      return;
    }

    if (nextIndex >= 0) {
      const nextOption = CONTACT_PREFERENCE_OPTIONS[nextIndex];
      setFormData((prev) => ({ ...prev, contactPreference: nextOption.id }));
      const nextCard = document.getElementById(`pref-card-${nextOption.id}`);
      nextCard?.focus();
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
        formData.contactPreference,
        undefined,
        idempotencyKey
      );

      if (!orderResult.success || !orderResult.reference || !orderResult.orderId) {
        // En caso de timeout del cliente o fallo transitorio de red:
        // Preservar la clave de idempotencia y mantener al usuario en el Paso 3 para permitir reintento seguro
        if (orderResult.code === 'CLIENT_TIMEOUT' || orderResult.isTimeout) {
          setErrorMessage(
            orderResult.error ||
              'La solicitud de reserva tardó más de 15 segundos en responder. Tu selección y clave única de compra se mantienen protegidas. Por favor haz clic en "Confirmar Reserva y Ver Cuentas" para reintentar sin perder tus boletos.'
          );
          return;
        }

        if (orderResult.code === 'NETWORK_ERROR') {
          setErrorMessage(
            orderResult.error ||
              'Problema de conexión con el servidor. Revisa tu acceso a internet y haz clic en "Confirmar Reserva y Ver Cuentas" para reintentar.'
          );
          return;
        }

        if (orderResult.code === 'CONFLICT' || orderResult.code === '23505') {
          setErrorMessage(
            'Ya existe una orden registrada para esta solicitud. Consulta el estado de tus boletos en el módulo de verificación.'
          );
          setHasReservationError(true);
          return;
        }

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
      const normalized = normalizeAppError(err, 'Error inesperado al generar la reserva');
      logAppError('ModalCheckout.handleConfirmReservation', normalized);
      setErrorMessage(normalized.userMessage);
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
    setProofIdempotencyKey(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : ''
    );

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
    setProofIdempotencyKey(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : ''
    );
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
        paymentReferenceInput.trim() || undefined,
        proofIdempotencyKey
      );

      if (!uploadRes.success) {
        const normalized = normalizeAppError(
          { code: uploadRes.code, message: uploadRes.error },
          'No se pudo procesar el comprobante de pago.'
        );
        setErrorMessage(normalized.userMessage);
        return;
      }

      // Transición exitosa a confirmación definitiva (Paso 7)
      setCurrentStep(7);
      clearSelection();
      void refreshTickets();
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al procesar el comprobante.');
      logAppError('ModalCheckout.handleSubmitProof', normalized);
      setErrorMessage(normalized.userMessage);
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
      <div
        ref={modalCardRef}
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-checkout-title"
        tabIndex={-1}
      >
        {/* Barra Superior del Modal */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBox}>
            <ShieldCheck size={22} className={styles.shieldIcon} aria-hidden="true" />
            <div>
              <h3 id="modal-checkout-title" className={styles.modalTitle}>Checkout Seguro</h3>
              <span className={styles.modalSub}>Gran Rifa Ecoturística Manaure Vive</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeBtn}
            aria-label="Cerrar ventana de compra"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Indicador Visual de Progreso (7 Pasos Segmentados) */}
        {!hasReservationError && (
          <div className={styles.stepperBar} role="region" aria-label="Progreso del checkout">
            <div className={styles.stepperSegments} aria-hidden="true">
              {([1, 2, 3, 4, 5, 6, 7] as CheckoutStepNumber[]).map((stepNum) => {
                const isCompleted = currentStep > stepNum;
                const isCurrent = currentStep === stepNum;
                let stepClass = styles.stepPending;
                if (isCompleted) stepClass = styles.stepCompleted;
                else if (isCurrent) stepClass = styles.stepCurrent;

                return (
                  <div
                    key={stepNum}
                    className={`${styles.stepperSegment} ${stepClass}`}
                    title={`Paso ${stepNum}: ${STEP_TITLES[stepNum]}`}
                  />
                );
              })}
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
            <AlertCircle size={48} className={styles.errorBigIcon} aria-hidden="true" />
            <h4 className={styles.errorTitle}>No pudimos completar la reserva</h4>
            <p className={styles.errorTextMsg}>
              {errorMessage || 'Ocurrió un problema temporal al procesar tus boletos.'}
            </p>
            <div className={styles.errorActions}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={() => {
                  setHasReservationError(false);
                  void handleConfirmReservation();
                }}
              >
                Reintentar Reserva
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setHasReservationError(false);
                  setCurrentStep(1);
                  setIdempotencyKey(
                    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                      ? crypto.randomUUID()
                      : ''
                  );
                }}
              >
                Elegir otros boletos
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
                {errors.fullName && (
                  <span className={styles.errorText} role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{errors.fullName}</span>
                  </span>
                )}
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
                {errors.documentId && (
                  <span className={styles.errorText} role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{errors.documentId}</span>
                  </span>
                )}
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
                {errors.phone && (
                  <span className={styles.errorText} role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{errors.phone}</span>
                  </span>
                )}
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
                {errors.email && (
                  <span className={styles.errorText} role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{errors.email}</span>
                  </span>
                )}
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
                {errors.city && (
                  <span className={styles.errorText} role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    <span>{errors.city}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Canal Oficial de Notificación */}
            <div className={styles.contactPreferenceContainer}>
              <div className={styles.contactPreferenceHeader}>
                <label id="contact-preference-label" className={styles.contactPreferenceTitle}>
                  <Bell size={16} className={styles.contactTitleIcon} aria-hidden="true" />
                  <span>Canal oficial de confirmación</span>
                </label>
                <span className={styles.contactPreferenceHint}>
                  Elige cómo deseas recibir el estado y respaldo de tus números
                </span>
              </div>

              <div
                className={styles.contactPreferenceGrid}
                role="radiogroup"
                aria-labelledby="contact-preference-label"
              >
                {CONTACT_PREFERENCE_OPTIONS.map((option) => {
                  const isSelected = formData.contactPreference === option.id;
                  const Icon = option.icon;

                  let badgeClass = styles.badgeManual;
                  if (option.badgeType === 'auto') badgeClass = styles.badgeAuto;
                  else if (option.badgeType === 'recommended') badgeClass = styles.badgeRecommended;

                  return (
                    <div
                      key={option.id}
                      id={`pref-card-${option.id}`}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, contactPreference: option.id }))
                      }
                      onKeyDown={(e) => handlePreferenceKeyDown(e, option.id)}
                      className={`${styles.contactOptionCard} ${
                        isSelected ? styles.contactOptionCardSelected : ''
                      }`}
                    >
                      <input
                        type="radio"
                        id={`input-pref-${option.id}`}
                        name="contactPreference"
                        value={option.id}
                        checked={isSelected}
                        onChange={() =>
                          setFormData((prev) => ({ ...prev, contactPreference: option.id }))
                        }
                        className={styles.srOnly}
                        tabIndex={-1}
                        aria-hidden="true"
                      />

                      <div
                        className={`${styles.radioIndicator} ${
                          isSelected ? styles.radioIndicatorSelected : ''
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && <span className={styles.radioDot} />}
                      </div>

                      <div className={styles.contactOptionContent}>
                        <div className={styles.contactOptionTopRow}>
                          <div className={styles.contactOptionTitleWrap}>
                            <Icon size={18} className={styles.contactOptionIcon} aria-hidden="true" />
                            <strong className={styles.contactOptionTitle}>{option.title}</strong>
                          </div>
                          <span className={`${styles.contactOptionBadge} ${badgeClass}`}>
                            {option.badge}
                          </span>
                        </div>

                        <p className={styles.contactOptionDescription}>{option.description}</p>
                        <p className={styles.contactOptionSubtext}>{option.subtext}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Advertencia / Caja Informativa cuando se selecciona email o both */}
              {(formData.contactPreference === 'email' || formData.contactPreference === 'both') && (
                <div className={styles.emailNoticeBox} role="status" aria-live="polite">
                  <Mail size={18} className={styles.emailNoticeIcon} aria-hidden="true" />
                  <div className={styles.emailNoticeContent}>
                    <strong className={styles.emailNoticeTitle}>📩 Importante:</strong>
                    <p className={styles.emailNoticeText}>
                      Después de la validación del pago recibirás la confirmación en tu correo. Si no
                      aparece en la bandeja principal, revisa <strong>Spam</strong>,{' '}
                      <strong>Correo no deseado</strong> o <strong>Promociones</strong>.
                    </p>
                  </div>
                </div>
              )}
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
              {errors.acceptTerms && (
                <span className={styles.errorText} role="alert">
                  <AlertCircle size={14} aria-hidden="true" />
                  <span>{errors.acceptTerms}</span>
                </span>
              )}
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={handleClose} className={styles.btnBack}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnNext}>
                <span>Continuar a Resumen de Números</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* PASO 2: RESUMEN DE NÚMEROS                                               */}
        {/* ========================================================================= */}
        {!hasReservationError && currentStep === 2 && (
          <div className={styles.stepContent}>
            <div className={styles.stepHeaderRow}>
              <h4
                className={`${styles.sectionHeader} ${styles.sectionHeaderNoBorder}`}
              >
                Tus Números Seleccionados
              </h4>
              <span className={styles.stepperBadge}>
                {selectedTickets.length} {selectedTickets.length === 1 ? 'Boleto' : 'Boletos'}
              </span>
            </div>

            <p className={styles.stepDescription}>
              Verifica los números que vas a apartar para la Gran Rifa Ecoturística Manaure Vive:
            </p>

            <div className={styles.ticketsGridBig}>
              {selectedTickets.map((num) => (
                <div key={num} className={styles.ticketChipBig}>
                  <Ticket size={18} color="var(--brand-accent)" className={styles.ticketChipIcon} aria-hidden="true" />
                  <span className={styles.ticketChipNumber}>{formatTicketNumber(num)}</span>
                  <span className={styles.ticketChipLabel}>Boleto</span>
                </div>
              ))}
            </div>

            <div className={styles.buyerSummaryCard}>
              <span className={styles.buyerSummaryLabel}>
                Comprador:
              </span>
              <strong className={styles.buyerSummaryName}>{formData.fullName}</strong>
              <span className={styles.buyerSummaryMeta}>
                C.C. {formData.documentId} • Cel: {formData.phone}
              </span>
            </div>

            <div className={styles.stepNavigation}>
              <button type="button" onClick={() => setCurrentStep(1)} className={styles.btnBack}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Atrás: Datos</span>
              </button>
              <button type="button" onClick={() => setCurrentStep(3)} className={styles.btnNext}>
                <span>Continuar a Total a Pagar</span>
                <ChevronRight size={18} aria-hidden="true" />
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
                <strong className={styles.pricingMethodHighlight}>Transferencia Manual Directa</strong>
              </div>

              <div className={styles.pricingDivider} />

              <div className={styles.pricingTotalRow}>
                <strong>Total a Pagar:</strong>
                <span className={styles.pricingTotalVal}>{formatCOP(totalAmount)}</span>
              </div>
            </div>

            <div className={styles.reservationNotice}>
              <Clock size={20} className={styles.noticeIcon} aria-hidden="true" />
              <div>
                <strong className={styles.noticeHeading}>
                  Bloqueo atómico de números:
                </strong>
                Al hacer clic en el botón a continuación, tus números quedarán asegurados y
                bloqueados por 10 minutos exclusivamente a tu nombre para que realices tu
                transferencia bancaria.
              </div>
            </div>

            {errorMessage && (
              <div className={styles.errorMessageBox} role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className={styles.stepNavigation}>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className={styles.btnBack}
                disabled={isReserving}
              >
                <ChevronLeft size={18} aria-hidden="true" />
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
                    <div className={`${styles.spinner} ${styles.spinnerSm}`} />
                    <span>Reservando en Base de Datos...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar Reserva y Ver Cuentas</span>
                    <ChevronRight size={18} aria-hidden="true" />
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
            {/* Banner de Reserva Exitosa con estado urgente si restan menos de 120s */}
            <div className={timeLeftSeconds < 120 ? styles.timerBannerUrgent : styles.timerBanner}>
              <Clock
                size={20}
                className={timeLeftSeconds < 120 ? styles.timerIconUrgent : styles.timerIcon}
                aria-hidden="true"
              />
              <div>
                <strong>Boletos Reservados: {formatTimer(timeLeftSeconds)}</strong>
                <p>
                  {timeLeftSeconds < 120
                    ? '¡Atención! Quedan menos de 2 minutos para completar tu transferencia bancaria.'
                    : 'Cuentas oficiales para realizar tu transferencia antes de que termine el tiempo.'}
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
                  aria-label={copiedKey === 'ref' ? 'Referencia copiada' : 'Copiar referencia de pago'}
                >
                  {copiedKey === 'ref' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  <span>{copiedKey === 'ref' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Aclaración oficial de métodos de pago */}
            <div className={styles.paymentNoticeBox}>
              <AlertCircle size={18} className={styles.paymentNoticeIcon} aria-hidden="true" />
              <span>
                Aceptamos transferencias directas (Bre-B, Nequi, Daviplata, Bancolombia). No recibimos pagos con tarjeta de crédito ni débito.
              </span>
            </div>

            {/* Cuentas de Transferencia */}
            <div className={styles.bankAccounts}>
              <h5 className={styles.bankTitle}>
                <QrCode size={18} color="var(--color-brand-accent, var(--brand-accent))" aria-hidden="true" />
                Realiza tu pago mediante una de las siguientes opciones.
              </h5>

              {paymentAccounts.length === 0 ? (
                <div className={styles.emptyAccountsNotice}>
                  <AlertCircle
                    size={20}
                    color="var(--brand-accent)"
                    className={styles.emptyNoticeIcon}
                    aria-hidden="true"
                  />
                  <div>
                    <strong className={styles.emptyNoticeTitle}>
                      No hay cuentas de pago activas en este momento.
                    </strong>
                    <p className={styles.emptyNoticeText}>
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
                      className={`${styles.accountOptionCard} ${isSelected ? styles.accountOptionCardSelected : ''} ${styles.accountOptionCardInteractive}`}
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setSelectedPaymentMethodName(`Transferencia Manual (${acc.bank_name})`);
                      }}
                    >
                      {/* Entidad y Tipo */}
                      <div className={styles.accountOptionHeader}>
                        <div className={styles.accountEntityRow}>
                          <Building2 size={18} className={styles.accountIcon} aria-hidden="true" />
                          <span className={styles.accountEntityName}>{acc.bank_name}</span>
                        </div>
                        <div className={styles.accountBadgesRow}>
                          {isSelected && (
                            <span className={styles.selectAccountBadge}>
                              <Check size={12} aria-hidden="true" /> Seleccionada
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
                          aria-label={
                            copiedKey === acc.id
                              ? 'Número copiado al portapapeles'
                              : `Copiar número de cuenta de ${acc.bank_name}`
                          }
                        >
                          {copiedKey === acc.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
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
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Atrás: Total</span>
              </button>

              <button type="button" onClick={() => setCurrentStep(5)} className={styles.btnNext}>
                <span>Continuar a Instrucciones</span>
                <ChevronRight size={18} aria-hidden="true" />
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
                    <strong className={styles.instructionHighlight}>{formatCOP(totalAmount)}</strong>
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
                    <strong className={styles.instructionHighlight}>{orderReference}</strong>
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
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Atrás: Cuentas</span>
              </button>

              <button type="button" onClick={() => setCurrentStep(6)} className={styles.btnNext}>
                <span>Proceder a Subir Comprobante</span>
                <ChevronRight size={18} aria-hidden="true" />
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
                  <FileImage size={32} color="var(--text-muted)" aria-hidden="true" />
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
                      <div className={styles.previewPdfBox}>
                        <FileText size={24} color="var(--brand-accent)" aria-hidden="true" />
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
                      <span className={styles.previewSize}>
                        {(Number(receiptFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.removeImgBtn}
                    onClick={handleRemoveReceipt}
                    title="Eliminar y seleccionar otro comprobante"
                    aria-label="Eliminar y seleccionar otro comprobante"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleFileChange}
              />

              <div className={styles.formGroupCompact}>
                <label
                  htmlFor="refInput"
                  className={styles.inputSubLabel}
                >
                  Número de Aprobación / Referencia Bancaria (Opcional):
                </label>
                <input
                  id="refInput"
                  type="text"
                  placeholder="Ej: 987654321 o CUS / Código de transferencia"
                  value={paymentReferenceInput}
                  onChange={(e) => setPaymentReferenceInput(e.target.value)}
                  className={styles.input}
                />
              </div>

              {errorMessage && (
                <div className={styles.errorMessageBox} role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
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
                <ChevronLeft size={18} aria-hidden="true" />
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
                    <div className={`${styles.spinner} ${styles.spinnerSm}`} />
                    <span>Enviando Comprobante...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} aria-hidden="true" />
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
              <CheckCircle2 size={42} aria-hidden="true" />
            </div>

            {/* Mensajes explícitos requeridos */}
            <h4 className={styles.successTitle}>Tu pedido ha sido recibido.</h4>

            <span className={styles.statusBadgePending}>
              <Clock size={14} aria-hidden="true" />
              Pendiente de verificación
            </span>

            <div className={styles.confirmationNoticeBanner}>
              <AlertCircle size={20} className={styles.confirmationNoticeIcon} aria-hidden="true" />
              <div>
                <strong>Tu pago será verificado manualmente.</strong>
                <p className={styles.confirmationNoticeText}>
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
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Número de Orden:
                </span>
                <span className={styles.confirmationTableVal}>
                  <strong className={styles.confirmationRefCode}>
                    {orderReference}
                  </strong>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(orderReference, 'confirm_ref')}
                    className={`${styles.copyBtn} ${styles.copyBtnMini}`}
                    aria-label={copiedKey === 'confirm_ref' ? 'Número de orden copiado' : 'Copiar número de orden'}
                  >
                    {copiedKey === 'confirm_ref' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                    <span>{copiedKey === 'confirm_ref' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Ticket
                    size={14}
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Números Seleccionados:
                </span>
                <span className={styles.confirmationTableVal}>
                  {confirmedTickets.map((num) => (
                    <span
                      key={num}
                      className={styles.confirmedTicketBadge}
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
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Total Liquidado:
                </span>
                <span className={`${styles.confirmationTableVal} ${styles.confirmationTotalVal}`}>
                  {formatCOP(confirmedTotalAmount > 0 ? confirmedTotalAmount : totalAmount)}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Clock
                    size={14}
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Estado de la Orden:
                </span>
                <span className={styles.confirmationTableVal}>
                  <span className={styles.statusBadgeInlinePending}>
                    <Clock size={12} aria-hidden="true" /> Pendiente de verificación
                  </span>
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Calendar
                    size={14}
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Fecha y Hora:
                </span>
                <span className={`${styles.confirmationTableVal} ${styles.confirmationValSm}`}>
                  {formatOrderDateTime(orderCreatedAt)}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Building2
                    size={14}
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Método de Pago:
                </span>
                <span className={`${styles.confirmationTableVal} ${styles.confirmationValMd}`}>
                  {selectedPaymentMethodName}
                </span>
              </div>

              <div className={styles.confirmationTableRow}>
                <span className={styles.confirmationTableLabel}>
                  <Bell
                    size={14}
                    className={styles.confirmationIconInline}
                    aria-hidden="true"
                  />
                  Canal de Notificación:
                </span>
                <span className={`${styles.confirmationTableVal} ${styles.confirmationChannelVal}`}>
                  {formatContactPreferenceLabel(formData.contactPreference)}
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
                  <Search size={16} aria-hidden="true" />
                  <span>Consultar mis Boletos</span>
                </a>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnActionWhatsapp}
                >
                  <MessageCircle size={16} aria-hidden="true" />
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
