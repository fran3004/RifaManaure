import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Loader2,
  Ticket,
} from 'lucide-react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import {
  fetchBuyerOrdersHistory,
  type BuyerItem,
  type BuyerOrderSummary,
} from '@/services/buyerService';
import styles from './AdminBuyerOrdersModal.module.css';

interface AdminBuyerOrdersModalProps {
  buyer: BuyerItem | null;
  isOpen: boolean;
  onClose: () => void;
}

interface AdminBuyerOrdersContentProps {
  buyer: BuyerItem;
  onClose: () => void;
}

const AdminBuyerOrdersContent: React.FC<AdminBuyerOrdersContentProps> = ({ buyer, onClose }) => {
  const [orders, setOrders] = useState<BuyerOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetchBuyerOrdersHistory(buyer.id);
        if (isMounted) {
          if (res.success) {
            setOrders(res.orders);
          } else {
            setErrorMessage(res.error || 'Error al cargar órdenes del comprador.');
          }
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Error inesperado al cargar historial.';
          setErrorMessage(msg);
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [buyer.id]);

  const paidOrders = orders.filter((o) => o.status === 'paid');
  const totalSpent = paidOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalTickets = paidOrders.reduce((sum, o) => sum + o.ticket_count, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className={styles.statusPaid}>
            <CheckCircle2 size={12} />
            <span>Aprobada</span>
          </span>
        );
      case 'pending':
        return (
          <span className={styles.statusPending}>
            <Clock size={12} />
            <span>Pendiente</span>
          </span>
        );
      case 'rejected':
      case 'cancelled':
        return (
          <span className={styles.statusRejected}>
            <XCircle size={12} />
            <span>Rechazada</span>
          </span>
        );
      case 'expired':
        return (
          <span className={styles.statusExpired}>
            <Clock size={12} />
            <span>Expirada</span>
          </span>
        );
      default:
        return (
          <span className={styles.statusPending}>
            <span>{status}</span>
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <ShoppingBag size={20} />
            </div>
            <div>
              <h3 className={styles.headerTitle}>Historial de Órdenes</h3>
              <span className={styles.headerSubtitle}>
                Trazabilidad de compras y boletos adquiridos
              </span>
            </div>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.modalBody}>
          {/* Tarjeta Perfil del Comprador */}
          <div className={styles.buyerProfileCard}>
            <div className={styles.profileTop}>
              <h4 className={styles.profileName}>{buyer.full_name}</h4>
              <span className={styles.profileDoc}>C.C. {buyer.document_id}</span>
            </div>

            <div className={styles.profileInfoGrid}>
              <div className={styles.infoItem}>
                <Phone size={14} />
                {buyer.phone ? (
                  <a
                    href={`https://wa.me/57${buyer.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Contactar por WhatsApp"
                  >
                    {buyer.phone}
                  </a>
                ) : (
                  <span>No registrado</span>
                )}
              </div>

              <div className={styles.infoItem}>
                <Mail size={14} />
                <span>{buyer.email || 'No registrado'}</span>
              </div>

              <div className={styles.infoItem}>
                <MapPin size={14} />
                <span>{buyer.city || 'Manaure, La Guajira'}</span>
              </div>

              <div className={styles.infoItem}>
                <Calendar size={14} />
                <span>Registrado: {formatDate(buyer.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Estadísticas de Compra */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total Órdenes</span>
              <strong className={styles.statValue}>{orders.length}</strong>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Aprobadas</span>
              <strong className={`${styles.statValue} ${styles.statValueEmerald}`}>
                {paidOrders.length}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Boletos Pagados</span>
              <strong className={`${styles.statValue} ${styles.statValueEmerald}`}>
                {totalTickets}
              </strong>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total Invertido</span>
              <strong className={`${styles.statValue} ${styles.statValueGold}`}>
                {formatCOP(totalSpent)}
              </strong>
            </div>
          </div>

          {/* Sección de Órdenes */}
          <div className={styles.ordersSection}>
            <h4 className={styles.ordersSectionTitle}>
              <Ticket size={16} />
              <span>Detalle de Órdenes ({orders.length})</span>
            </h4>

            {isLoading ? (
              <div className={styles.ordersLoading}>
                <Loader2 size={20} className="animate-spin" />
                <span>Cargando historial de órdenes...</span>
              </div>
            ) : errorMessage ? (
              <div className={styles.ordersError}>
                {errorMessage}
              </div>
            ) : orders.length === 0 ? (
              <div className={styles.ordersEmpty}>
                Este comprador aún no tiene órdenes registradas.
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th>Referencia</th>
                      <th>Fecha</th>
                      <th>Boletos</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th className={styles.thRight}>Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord) => (
                      <tr key={ord.id}>
                        {/* 1. Referencia */}
                        <td>
                          <span className={styles.refChip}>{ord.reference}</span>
                        </td>

                        {/* 2. Fecha */}
                        <td className={styles.dateCell}>
                          {formatDate(ord.created_at)}
                        </td>

                        {/* 3. Boletos */}
                        <td>
                          {ord.tickets && ord.tickets.length > 0 ? (
                            <div className={styles.ticketsList}>
                              {ord.tickets.map((t) => (
                                <span
                                  key={t.id || t.ticket_number}
                                  className={styles.ticketNumberChip}
                                >
                                  #{formatTicketNumber(t.ticket_number)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className={styles.ticketCountText}>{ord.ticket_count}</span>
                          )}
                        </td>

                        {/* 4. Total */}
                        <td>
                          <strong className={styles.orderTotalAmount}>
                            {formatCOP(ord.total_amount)}
                          </strong>
                        </td>

                        {/* 5. Estado */}
                        <td>{getStatusBadge(ord.status)}</td>

                        {/* 6. Comprobante */}
                        <td className={styles.tdRight}>
                          {ord.receipt_url ? (
                            <a
                              href={ord.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.receiptBtn}
                              title="Ver soporte de pago"
                            >
                              <ExternalLink size={12} />
                              <span>Ver</span>
                            </a>
                          ) : (
                            <span className={styles.receiptEmpty}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Pie del Modal */}
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnClose} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export const AdminBuyerOrdersModal: React.FC<AdminBuyerOrdersModalProps> = ({
  buyer,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !buyer) return null;

  return <AdminBuyerOrdersContent key={buyer.id} buyer={buyer} onClose={onClose} />;
};
