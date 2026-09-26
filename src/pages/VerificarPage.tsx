import React, { useState, useRef } from 'react';
import {
  Search,
  ShieldCheck,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  MessageCircle,
  Download,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { formatTicketNumber, formatCOP, createWhatsAppLink } from '@/lib/utils';
import { verifyPublicOrderOrTickets, type PublicOrderVerification } from '@/services/ticketService';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import { DigitalReceiptModal } from '@/components/receipt/DigitalReceiptModal';
import type { DigitalReceiptData } from '@/services/receiptGeneratorService';
import { FloatingWhatsAppBtn } from '@/components/common/FloatingWhatsAppBtn';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import styles from './VerificarPage.module.css';

export const VerificarPage: React.FC = () => {
  useDocumentTitle('Verificación Oficial de Boletos y Órdenes');
  const systemSettings = useSystemSettings();
  const supportPhone = systemSettings.support_whatsapp_number || '573001234567';

  const [searchQuery, setSearchQuery] = useState('');
  const [secondaryQuery, setSecondaryQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orders, setOrders] = useState<PublicOrderVerification[]>([]);
  const [searchedTerm, setSearchedTerm] = useState('');
  const [selectedReceiptData, setSelectedReceiptData] = useState<DigitalReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Control del flujo progresivo en dos pasos
  const [requiresPhone, setRequiresPhone] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

  const handleQueryChange = (value: string) => {
    setSearchQuery(value);
    // Si el usuario edita o borra caracteres de la cédula, reseteamos el estado secundario para permitir retroceder libremente
    if (requiresPhone) {
      setRequiresPhone(false);
      setSecondaryQuery('');
      setErrorMsg('');
      setOrders([]);
    }
    if (hasSearched) {
      setHasSearched(false);
    }
  };

  const handleResetQuery = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setRequiresPhone(false);
    setSearchQuery('');
    setSecondaryQuery('');
    setErrorMsg('');
    setHasSearched(false);
    setOrders([]);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const query = searchQuery.trim();
    if (!query) {
      setErrorMsg(
        'Por favor ingresa un número de cédula de ciudadanía o la referencia de tu orden.'
      );
      return;
    }

    // PASO 2: Si el sistema ya confirmó que la cédula existe con boletos y se está validando el teléfono
    if (requiresPhone) {
      if (!secondaryQuery || secondaryQuery.trim().length < 4) {
        setErrorMsg(
          'Por favor ingresa tu número de teléfono registrado o sus últimos 4 dígitos.'
        );
        secondaryInputRef.current?.focus();
        return;
      }

      setIsLoading(true);
      try {
        const result = await verifyPublicOrderOrTickets(query, secondaryQuery.trim());
        if (result.success && result.orders.length > 0) {
          setOrders(result.orders);
          setHasSearched(true);
          setSearchedTerm(query);
          setErrorMsg('');
        } else {
          setErrorMsg(
            result.error ||
              'El número de teléfono o los últimos 4 dígitos no coinciden con los registrados para esta cédula. Intenta nuevamente.'
          );
          setOrders([]);
          setTimeout(() => secondaryInputRef.current?.focus(), 80);
        }
      } catch (err) {
        const normalized = normalizeAppError(
          err,
          'Ocurrió un problema de conexión al verificar los datos. Por favor intenta nuevamente.'
        );
        logAppError('VerificarPage.handleSearch.phone', normalized);
        setErrorMsg(normalized.userMessage);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // PASO 1: Consulta inicial por cédula o por referencia
    setIsLoading(true);
    setHasSearched(false);
    setSearchedTerm(query);

    try {
      const result = await verifyPublicOrderOrTickets(query);
      if (result.requiresSecondary) {
        // La cédula fue detectada con boletos -> Solicitar segundo factor (teléfono)
        setRequiresPhone(true);
        setOrders([]);
        setErrorMsg('');
        setTimeout(() => {
          secondaryInputRef.current?.focus();
        }, 100);
      } else if (result.success && result.orders.length > 0) {
        // Consulta por referencia o directa encontrada
        setRequiresPhone(false);
        setOrders(result.orders);
        setHasSearched(true);
        setErrorMsg('');
      } else {
        // No se encontraron registros para la cédula o referencia -> mostrar estado vacío sin pedir teléfono
        setRequiresPhone(false);
        setOrders([]);
        setHasSearched(true);
        setErrorMsg('');
      }
    } catch (err) {
      const normalized = normalizeAppError(
        err,
        'Ocurrió un problema de conexión al verificar los datos. Por favor intenta nuevamente.'
      );
      logAppError('VerificarPage.handleSearch.initial', normalized);
      setErrorMsg(normalized.userMessage);
      setOrders([]);
      setHasSearched(true);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.pageLayout} data-theme="public">
      <a href="#contenido-verificar" className="skipLink">
        Saltar al contenido de verificación
      </a>
      <Navbar />
      <main id="contenido-verificar" tabIndex={-1} className={styles.mainContent}>
        <div className={`container ${styles.container}`}>
          <div className={styles.header}>
            <div className={styles.badge}>
              <ShieldCheck size={16} />
              <span>Consulta Pública Oficial</span>
            </div>
            <h1 className={styles.title}>Verificación de Boletos y Órdenes</h1>
            <p className={styles.subtitle}>
              Consulta en tiempo real el estado oficial de tus boletos y órdenes de compra en la
              plataforma <strong>Manaure Vive</strong> de forma 100% segura y privada.
            </p>
          </div>

          {/* Formulario de Consulta Progresiva */}
          <form onSubmit={handleSearch} className={styles.searchCard}>
            <div className={styles.inputGroup}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <label htmlFor="searchInput" className={styles.label}>
                  Número de Cédula o Referencia de Orden
                </label>
                {requiresPhone && (
                  <div className={styles.detectedBadge}>
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>Cédula con boletos registrados</span>
                  </div>
                )}
              </div>

              <div className={styles.inputWrapper}>
                <input
                  id="searchInput"
                  ref={searchInputRef}
                  type="text"
                  placeholder="Ej: 1065892340 o referencia (MV-L8X9...)"
                  value={searchQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className={styles.input}
                  maxLength={50}
                />
                {requiresPhone ? (
                  <button
                    type="button"
                    className={styles.btnChangeQuery}
                    onClick={handleResetQuery}
                    title="Borrar o ingresar otra cédula"
                    aria-label="Cambiar o borrar número de cédula"
                  >
                    <RotateCcw
                      size={15}
                      aria-hidden="true"
                      style={{ verticalAlign: 'middle', marginRight: '0.35rem' }}
                    />
                    Cambiar Cédula
                  </button>
                ) : (
                  <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                    <Search size={18} aria-hidden="true" />{' '}
                    {isLoading ? 'Consultando...' : 'Consultar Estado'}
                  </button>
                )}
              </div>

              {/* Sección de Teléfono: SOLO SE MUESTRA si el sistema detecta que la cédula SÍ tiene boletos registrados */}
              {requiresPhone && (
                <div className={styles.secondaryFieldGroup}>
                  <label htmlFor="secondaryInput" className={styles.label}>
                    Confirmar Teléfono Registrado o Últimos 4 Dígitos
                  </label>
                  <div className={styles.inputWrapper}>
                    <input
                      id="secondaryInput"
                      ref={secondaryInputRef}
                      type="tel"
                      placeholder="Ej: 3001234567 o 4567"
                      value={secondaryQuery}
                      onChange={(e) => setSecondaryQuery(e.target.value)}
                      className={styles.input}
                      maxLength={20}
                      autoFocus
                    />
                    <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                      <Search size={18} aria-hidden="true" />{' '}
                      {isLoading ? 'Verificando...' : 'Confirmar y Ver Boletos'}
                    </button>
                  </div>
                  <span className={styles.searchHint}>
                    Por seguridad y para proteger la privacidad de los participantes, confirma el número
                    de teléfono o los últimos 4 dígitos con los que realizaste la compra.
                  </span>
                </div>
              )}

              {!requiresPhone && (
                <span className={styles.searchHint}>
                  Ingresa tu número de cédula o la referencia de tu orden para consultar el estado
                  oficial de tus boletos.
                </span>
              )}

              {errorMsg && (
                <p className={styles.errorText} role="alert">
                  <AlertCircle size={14} aria-hidden="true" /> {errorMsg}
                </p>
              )}
            </div>
          </form>

          {/* Resultados de la Consulta */}
          {hasSearched && !isLoading && (
            <div className={styles.resultsContainer}>
              {orders.length > 0 ? (
                orders.map((ord) => {
                  const isPaid = ord.status === 'paid';
                  const isPendingVerification = ord.status === 'pending_verification';
                  const isRejected = ord.status === 'rejected';
                  const isPending = ord.status === 'pending';
                  const isExpired = ord.status === 'expired' || ord.status === 'cancelled';

                  return (
                    <div key={ord.id || ord.reference} className={styles.orderCard}>
                      {/* Cabecera de la Orden */}
                      <div className={styles.orderHeader}>
                        <div className={styles.orderRefGroup}>
                          <span className={styles.orderRefLabel}>Referencia de Orden</span>
                          <span className={styles.orderRefValue}>{ord.reference}</span>
                          <span className={styles.orderDate}>
                            Registrada el {formatDate(ord.createdAt)}
                          </span>
                        </div>

                        <div className={styles.buyerInfoGroup}>
                          <span className={styles.buyerLabel}>
                            Comprador Registrado
                          </span>
                          <span className={styles.buyerName}>
                            {ord.maskedBuyerName}
                          </span>
                          <span className={styles.buyerDoc}>
                            Doc: {ord.maskedDocumentId}
                          </span>
                        </div>
                      </div>

                      {/* Banner de Estado Diferenciado */}
                      {isPaid && (
                        <div className={`${styles.statusBanner} ${styles.statusBannerPaid}`}>
                          <div className={styles.statusIconWrapper}>
                            <CheckCircle2 size={24} color="var(--color-success)" />
                          </div>
                          <div className={styles.statusBannerContent}>
                            <h3 className={styles.statusTitle}>
                              Pago Confirmado y Boletos Garantizados
                            </h3>
                            <p className={styles.statusDescription}>
                              Tu pago ha sido verificado y aprobado oficialmente. Tus números están
                              asegurados e inscritos en el registro oficial del sorteo.
                            </p>
                            <div className={styles.receiptActionWrapper}>
                              <button
                                type="button"
                                className={styles.downloadReceiptBtn}
                                onClick={() => {
                                  setSelectedReceiptData({
                                    orderReference: ord.reference,
                                    orderStatus: 'paid',
                                    createdAt: ord.createdAt,
                                    totalAmount: ord.totalAmount,
                                    ticketCount: ord.ticketCount,
                                    buyerName: ord.maskedBuyerName,
                                    buyerDocumentMasked: ord.maskedDocumentId,
                                    raffleTitle: ord.raffle.title,
                                    lotteryReference: ord.raffle.lotteryReference,
                                    drawDate: ord.raffle.drawDate,
                                    ticketNumbers: ord.tickets.map((t) => t.number),
                                  });
                                  setIsReceiptModalOpen(true);
                                }}
                              >
                                <Download size={16} />
                                <span>Descargar Comprobante Digital Oficial</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {isPendingVerification && (
                        <div
                          className={`${styles.statusBanner} ${styles.statusBannerPendingVerification}`}
                        >
                          <div className={styles.statusIconWrapper}>
                            <Clock size={24} color="var(--brand-accent)" />
                          </div>
                          <div>
                            <h3 className={styles.statusTitle}>
                              Comprobante en Proceso de Verificación
                            </h3>
                            <p className={styles.statusDescription}>
                              Recibimos tu comprobante de pago manual. Nuestro equipo administrativo
                              está validando la transferencia con la entidad bancaria. Tus números
                              permanecen <strong>protegidos y apartados</strong> a tu nombre durante
                              este proceso.
                            </p>
                          </div>
                        </div>
                      )}

                      {isRejected && (
                        <div className={`${styles.statusBanner} ${styles.statusBannerRejected}`}>
                          <div className={styles.statusIconWrapper}>
                            <XCircle size={24} color="#ef4444" />
                          </div>
                          <div>
                            <h3 className={styles.statusTitle}>Comprobante / Pago No Aprobado</h3>
                            <p className={styles.statusDescription}>
                              El comprobante enviado no pudo ser verificado.
                              {ord.rejectionReason && (
                                <span className={styles.rejectionReason}>
                                  Motivo indicado: {ord.rejectionReason}
                                </span>
                              )}
                              Por favor comunícate de inmediato con nuestro canal oficial de soporte
                              para revisar tu caso.
                            </p>
                          </div>
                        </div>
                      )}

                      {isPending && (
                        <div className={`${styles.statusBanner} ${styles.statusBannerPending}`}>
                          <div className={styles.statusIconWrapper}>
                            <Clock size={24} color="#60a5fa" />
                          </div>
                          <div>
                            <h3 className={styles.statusTitle}>Reserva Temporal Activa</h3>
                            <p className={styles.statusDescription}>
                              Tu orden está en proceso de reserva. Recuerda subir tu comprobante de
                              transferencia antes de que finalice el tiempo límite para evitar que
                              los números sean liberados.
                            </p>
                          </div>
                        </div>
                      )}

                      {isExpired && (
                        <div className={`${styles.statusBanner} ${styles.statusBannerExpired}`}>
                          <div className={styles.statusIconWrapper}>
                            <AlertCircle size={24} color="#94a3b8" />
                          </div>
                          <div>
                            <h3 className={styles.statusTitle}>Orden Expirada o Cancelada</h3>
                            <p className={styles.statusDescription}>
                              El tiempo límite de 10 minutos para adjuntar el comprobante concluyó y
                              los números fueron liberados nuevamente para la venta pública.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Información Pública del Sorteo */}
                      <div className={styles.raffleInfoCard}>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Sorteo Oficial</span>
                          <span className={styles.raffleInfoValue}>{ord.raffle.title}</span>
                        </div>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Lotería de Juego</span>
                          <span className={styles.raffleInfoValue}>
                            {ord.raffle.lotteryReference}
                          </span>
                        </div>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Fecha del Sorteo</span>
                          <span className={styles.raffleInfoValue}>
                            <Calendar
                              size={13}
                              className={styles.calendarIcon}
                            />
                            {ord.raffle.drawDate
                              ? formatDate(ord.raffle.drawDate)
                              : 'Fecha oficial según cronograma'}
                          </span>
                        </div>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Total de la Orden</span>
                          <span
                            className={`${styles.raffleInfoValue} ${styles.raffleInfoHighlight}`}
                          >
                            {formatCOP(ord.totalAmount)} ({ord.ticketCount}{' '}
                            {ord.ticketCount === 1 ? 'boleto' : 'boletos'})
                          </span>
                        </div>
                      </div>

                      {/* Sección de Boletos Asignados */}
                      <div className={styles.ticketsSection}>
                        <div className={styles.ticketsSectionHeader}>
                          <h4 className={styles.ticketsSectionTitle}>
                            <Ticket
                              size={16}
                              className={styles.ticketTitleIcon}
                            />
                            Números Asignados ({ord.tickets.length})
                          </h4>
                          <span className={styles.ticketsSectionSub}>
                            Numeración oficial de 3 cifras
                          </span>
                        </div>

                        <div className={styles.ticketsGrid}>
                          {ord.tickets.map((t) => (
                            <div key={t.number} className={styles.ticketChip}>
                              <span className={styles.ticketNumber}>
                                {formatTicketNumber(t.number)}
                              </span>
                              <span
                                className={`${styles.ticketChipStatus} ${
                                  t.status === 'sold'
                                    ? styles.ticketChipSold
                                    : t.status === 'blocked'
                                      ? styles.ticketChipBlocked
                                      : styles.ticketChipPending
                                }`}
                              >
                                {t.status === 'sold'
                                  ? 'Confirmado'
                                  : isPendingVerification
                                    ? 'En Verificación'
                                    : t.status === 'blocked'
                                      ? 'Bloqueado'
                                      : 'Apartado'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Callout de Soporte si la orden fue rechazada o tiene dudas */}
                      <div className={styles.supportCallout}>
                        <span className={styles.supportPrompt}>
                          ¿Tienes alguna duda sobre tu orden <strong>{ord.reference}</strong>?
                        </span>
                        <a
                          href={createWhatsAppLink(
                            supportPhone,
                            `Hola, deseo consultar el estado de mi orden ${ord.reference} en la plataforma Manaure Vive.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.supportBtn}
                        >
                          <MessageCircle size={16} />
                          <span>Contactar a Soporte</span>
                        </a>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyCard}>
                  <div className={styles.emptyIconWrapper}>
                    <Ticket size={36} />
                  </div>
                  <h3 className={styles.emptyTitle}>
                    No se encontraron órdenes para &quot;{searchedTerm}&quot;
                  </h3>
                  <p className={styles.emptyText}>
                    Verifica que hayas ingresado correctamente tu número de cédula completo o la
                    referencia exacta de tu orden (ej. <strong>MV-L8X9...</strong>). Si acabas de
                    realizar el pago, recuerda que la asignación se refleja de inmediato una vez
                    registrada.
                  </p>
                  <a
                    href={createWhatsAppLink(
                      supportPhone,
                      `Hola, realicé una compra con documento/referencia ${searchedTerm} pero no encuentro mis boletos en la página de verificación.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.supportBtn} ${styles.emptySupportBtn}`}
                  >
                    <MessageCircle size={16} />
                    <span>Ayuda con mi compra por WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {selectedReceiptData && (
        <DigitalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          receiptData={selectedReceiptData}
        />
      )}

      <Footer />
      <FloatingWhatsAppBtn />
    </div>
  );
};
