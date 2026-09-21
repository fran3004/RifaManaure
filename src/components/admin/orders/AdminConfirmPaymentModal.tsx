import React, { useEffect } from 'react';
import { formatCOP } from '@/lib/utils';
import type { OrderWithDetails } from '@/services/paymentService';
import { CheckCircle2, X, AlertCircle, ShieldCheck } from 'lucide-react';
import styles from './AdminConfirmPaymentModal.module.css';

export interface AdminConfirmPaymentModalProps {
  isOpen: boolean;
  order: OrderWithDetails | null;
  isProcessing?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

function formatTicketNumber(num: string): string {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num;
  return n.toString().padStart(3, '0');
}

export const AdminConfirmPaymentModal: React.FC<AdminConfirmPaymentModalProps> = ({
  isOpen,
  order,
  isProcessing = false,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen || !order) return null;

  const buyerName = order.buyers?.full_name || 'Comprador Desconocido';
  const buyerDoc = order.buyers?.document_id ? `C.C. ${order.buyers.document_id}` : 'Documento N/A';
  const buyerPhone = order.buyers?.phone || 'Sin teléfono';
  const tickets = order.tickets || [];
  const ticketCount = order.ticket_count || tickets.length;

  return (
    <div className={styles.backdrop} onClick={() => !isProcessing && onClose()}>
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
            disabled={isProcessing}
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.modalBody}>
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
              se emitirá el registro de auditoría en la base de datos y se despacharán las
              notificaciones transaccionales automáticas al comprador.
            </div>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className={styles.modalFooter}>
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
            onClick={() => void onConfirm()}
            disabled={isProcessing}
          >
            <CheckCircle2 size={16} />
            <span>{isProcessing ? 'Aprobando Pago...' : 'Sí, Aprobar Pago'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
