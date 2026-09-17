import React, { useState } from 'react';
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
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { formatTicketNumber, formatCOP, createWhatsAppLink } from '@/lib/utils';
import { verifyPublicOrderOrTickets, type PublicOrderVerification } from '@/services/ticketService';
import { DigitalReceiptModal } from '@/components/receipt/DigitalReceiptModal';
import type { DigitalReceiptData } from '@/services/receiptGeneratorService';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import styles from './VerificarPage.module.css';

export const VerificarPage: React.FC = () => {
  useDocumentTitle('Verificación Oficial de Boletos y Órdenes');
  const systemSettings = useSystemSettings();
  const supportPhone = systemSettings.support_whatsapp_number || '573001234567';

  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [orders, setOrders] = useState<PublicOrderVerification[]>([]);
  const [searchedTerm, setSearchedTerm] = useState('');
  const [selectedReceiptData, setSelectedReceiptData] = useState<DigitalReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const query = searchQuery.trim();
    if (!query) {
      setErrorMsg('Por favor ingresa un número de referencia (ej. MV-...) o tu cédula de ciudadanía.');
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setSearchedTerm(query);

    try {
      const result = await verifyPublicOrderOrTickets(query);
      if (result.success) {
        setOrders(result.orders);
        if (result.orders.length === 0) {
          setErrorMsg('');
        }
      } else {
        setErrorMsg(result.error || 'No se pudo realizar la consulta.');
        setOrders([]);
      }
    } catch (err) {
      console.error('Error al consultar boletos:', err);
      setErrorMsg('Ocurrió un problema de conexión al verificar los datos. Por favor intenta nuevamente.');
      setOrders([]);
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
    <div className={styles.pageLayout}>
      <Navbar />
      <main className={styles.mainContent}>
        <div className={`container ${styles.container}`}>
          <div className={styles.header}>
            <div className={styles.badge}>
              <ShieldCheck size={16} />
              <span>Consulta Pública Oficial</span>
            </div>
            <h1 className={styles.title}>Verificación de Boletos y Órdenes</h1>
            <p className={styles.subtitle}>
              Consulta en tiempo real el estado oficial de tus boletos y órdenes de compra en la plataforma <strong>Manaure Vive</strong> de forma 100% segura y privada.
            </p>
          </div>

          {/* Formulario de Consulta */}
          <form onSubmit={handleSearch} className={styles.searchCard}>
            <div className={styles.inputGroup}>
              <label htmlFor="searchInput" className={styles.label}>
                Número de Cédula o Referencia de Orden
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="searchInput"
                  type="text"
                  placeholder="Ej: MV-L8X9... o tu número de cédula (1065892340)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.input}
                  maxLength={50}
                />
                <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                  <Search size={18} /> {isLoading ? 'Consultando...' : 'Consultar Estado'}
                </button>
              </div>
              <span className={styles.searchHint}>
                Puedes ingresar tu número de cédula completo o la referencia que recibiste al completar el pedido.
              </span>
              {errorMsg && (
                <p className={styles.errorText}>
                  <AlertCircle size={14} /> {errorMsg}
                </p>
              )}
            </div>
          </form>

          {/* Resultados de la Consulta */}
          {hasSearched && !isLoading && (
            <div className={styles.resultsContainer}>
              {orders.length > 0 ? (
                orders.map((ord) => {
                  const isPaid = ord.status === 'paid' || ord.status === 'completed';
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
                          <span className={styles.orderDate}>Registrada el {formatDate(ord.createdAt)}</span>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #5e7a6f)', fontWeight: 600, display: 'block' }}>
                            Comprador Registrado
                          </span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary, #f3f7f5)' }}>
                            {ord.maskedBuyerName}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9cb5ab)', display: 'block' }}>
                            Doc: {ord.maskedDocumentId}
                          </span>
                        </div>
                      </div>

                      {/* Banner de Estado Diferenciado */}
                      {isPaid && (
                        <div className={`${styles.statusBanner} ${styles.statusBannerPaid}`}>
                          <div className={styles.statusIconWrapper}>
                            <CheckCircle2 size={24} color="#10b981" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <h3 className={styles.statusTitle}>Pago Confirmado y Boletos Garantizados</h3>
                            <p className={styles.statusDescription}>
                              Tu pago ha sido verificado y aprobado oficialmente. Tus números están asegurados e inscritos en la base de datos oficial del sorteo.
                            </p>
                            <div className={styles.receiptActionWrapper}>
                              <button
                                type="button"
                                className={styles.downloadReceiptBtn}
                                onClick={() => {
                                  setSelectedReceiptData({
                                    orderReference: ord.reference,
                                    orderStatus: ord.status === 'completed' ? 'completed' : 'paid',
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
                        <div className={`${styles.statusBanner} ${styles.statusBannerPendingVerification}`}>
                          <div className={styles.statusIconWrapper}>
                            <Clock size={24} color="#f59e0b" />
                          </div>
                          <div>
                            <h3 className={styles.statusTitle}>Comprobante en Proceso de Verificación</h3>
                            <p className={styles.statusDescription}>
                              Recibimos tu comprobante de pago manual. Nuestro equipo administrativo está validando la transferencia con la entidad bancaria. Tus números permanecen <strong>protegidos y apartados</strong> a tu nombre durante este proceso.
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
                                <span style={{ display: 'block', marginTop: '0.35rem', fontWeight: 600, color: '#fee2e2' }}>
                                  Motivo indicado: {ord.rejectionReason}
                                </span>
                              )}
                              Por favor comunícate de inmediato con nuestro canal oficial de soporte para revisar tu caso.
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
                              Tu orden está en proceso de reserva. Recuerda subir tu comprobante de transferencia antes de que finalice el tiempo límite para evitar que los números sean liberados.
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
                              El tiempo límite de 10 minutos para adjuntar el comprobante concluyó y los números fueron liberados nuevamente para la venta pública.
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
                          <span className={styles.raffleInfoValue}>{ord.raffle.lotteryReference}</span>
                        </div>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Fecha del Sorteo</span>
                          <span className={styles.raffleInfoValue}>
                            <Calendar size={13} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'text-bottom' }} />
                            {ord.raffle.drawDate ? formatDate(ord.raffle.drawDate) : 'Fecha oficial según cronograma'}
                          </span>
                        </div>
                        <div className={styles.raffleInfoGroup}>
                          <span className={styles.raffleInfoLabel}>Total de la Orden</span>
                          <span className={styles.raffleInfoValue} style={{ color: 'var(--color-brand-accent, #f59e0b)' }}>
                            {formatCOP(ord.totalAmount)} ({ord.ticketCount} {ord.ticketCount === 1 ? 'boleto' : 'boletos'})
                          </span>
                        </div>
                      </div>

                      {/* Sección de Boletos Asignados */}
                      <div className={styles.ticketsSection}>
                        <div className={styles.ticketsSectionHeader}>
                          <h4 className={styles.ticketsSectionTitle}>
                            <Ticket size={16} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'text-bottom' }} />
                            Números Asignados ({ord.tickets.length})
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #5e7a6f)' }}>
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
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9cb5ab)' }}>
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
                    Verifica que hayas ingresado correctamente tu número de cédula completo o la referencia exacta de tu orden (ej. <strong>MV-L8X9...</strong>). Si acabas de realizar el pago, recuerda que la asignación se refleja de inmediato una vez registrada.
                  </p>
                  <a
                    href={createWhatsAppLink(
                      supportPhone,
                      `Hola, realicé una compra con documento/referencia ${searchedTerm} pero no encuentro mis boletos en la página de verificación.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.supportBtn}
                    style={{ marginTop: '0.5rem' }}
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
    </div>
  );
};
