import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import {
  fetchAdminOrdersPaginated,
  approveOrderPayment,
  rejectOrderPayment,
  getSignedProofUrl,
  type OrderWithDetails,
} from '@/services/paymentService';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { formatCOP } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Clock,
  Check,
  AlertTriangle,
  AlertCircle,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { AdminOrderReviewModal } from '@/components/admin/orders/AdminOrderReviewModal';
import { AdminConfirmPaymentModal } from '@/components/admin/orders/AdminConfirmPaymentModal';
import styles from './AdminViews.module.css';

interface ReceiptThumbnailProps {
  receiptPath: string;
  reference: string;
  onSelect: (url: string) => void;
}

const ReceiptThumbnail: React.FC<ReceiptThumbnailProps> = ({
  receiptPath,
  reference,
  onSelect,
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isPdf =
    receiptPath.toLowerCase().endsWith('.pdf') || receiptPath.toLowerCase().includes('.pdf?');

  useEffect(() => {
    let active = true;
    const fetchUrl = async () => {
      setLoading(true);
      const res = await getSignedProofUrl(receiptPath, 900); // 15 min
      if (active) {
        if (res.url) {
          setSignedUrl(res.url);
        }
        setLoading(false);
      }
    };
    void fetchUrl();
    return () => {
      active = false;
    };
  }, [receiptPath]);

  if (loading) {
    return (
      <div className={styles.receiptThumbNotice}>
        <Clock size={18} className={styles.receiptThumbNoticeIcon} />
        Generando acceso seguro...
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className={`${styles.receiptThumbNotice} ${styles.receiptThumbNoticeError}`}>
        <AlertTriangle size={18} className={styles.receiptThumbNoticeIcon} />
        Acceso no disponible
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        className={`${styles.receiptImageThumbWrapper} ${styles.receiptPdfThumbWrapper}`}
        onClick={() => onSelect(signedUrl)}
        title="Clic para ver comprobante PDF"
      >
        <FileText size={34} color="var(--brand-accent)" />
        <span className={styles.receiptPdfLabel}>
          Documento PDF
        </span>
        <div className={styles.receiptOverlayZoom}>
          <Eye size={24} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.receiptImageThumbWrapper}
      onClick={() => onSelect(signedUrl)}
      title="Clic para ver comprobante en tamaño completo"
    >
      <img
        src={signedUrl}
        alt={`Comprobante de orden ${reference}`}
        className={styles.receiptImageThumb}
      />
      <div className={styles.receiptOverlayZoom}>
        <Eye size={24} />
      </div>
    </div>
  );
};

export const ReceiptsView: React.FC = () => {
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending_verification');
  const [selectedReviewOrder, setSelectedReviewOrder] = useState<OrderWithDetails | null>(null);
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [approvingOrder, setApprovingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(
    'Comprobante ilegible o no coincide con los valores recibidos'
  );
  const [actionProcessingId, setActionProcessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Reiniciar página a 1 si cambia la rifa seleccionada
  const [prevRaffleId, setPrevRaffleId] = useState(selectedRaffleId);
  if (prevRaffleId !== selectedRaffleId) {
    setPrevRaffleId(selectedRaffleId);
    setPage(1);
  }

  const loadReceipts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOrdersPaginated({
        statusFilter,
        searchTerm,
        page,
        pageSize,
        hasReceipt: true,
        raffleId: selectedRaffleId,
      });
      setOrders(res.orders);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages || 1);
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al cargar los comprobantes de pago');
      logAppError('ReceiptsView.loadReceipts', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchTerm, page, pageSize, selectedRaffleId]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchAdminOrdersPaginated({
          statusFilter,
          searchTerm,
          page,
          pageSize,
          hasReceipt: true,
          raffleId: selectedRaffleId,
        });
        if (isMounted) {
          setOrders(res.orders);
          setTotalCount(res.totalCount);
          setTotalPages(res.totalPages || 1);
          setIsForbidden(false);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const normalized = normalizeAppError(err, 'Error al cargar los comprobantes de pago');
          logAppError('ReceiptsView.init', normalized);
          setError(normalized.userMessage);
          setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
          setIsLoading(false);
        }
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, [statusFilter, searchTerm, page, pageSize, selectedRaffleId]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setPage(1);
  };

  const fromCount = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toCount = Math.min(page * pageSize, totalCount);

  const handleApprove = (order: OrderWithDetails) => {
    if (!order.receipt_url || order.status === 'pending') return;
    setApprovingOrder(order);
  };

  const handleConfirmApprove = async () => {
    if (!approvingOrder) return;

    setActionProcessingId(approvingOrder.id);
    setActionMessage(null);

    const result = await approveOrderPayment(approvingOrder.id);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: `¡Orden ${approvingOrder.reference} aprobada! Boletos vendidos confirmados.`,
      });
      setApprovingOrder(null);
      await loadReceipts();
    } else {
      const normalized = normalizeAppError(
        { message: result.error, code: result.code },
        'No se pudo aprobar el pago.'
      );
      logAppError('ReceiptsView.handleConfirmApprove', normalized);
      setActionMessage({ type: 'error', text: normalized.userMessage });
    }

    setActionProcessingId(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;

    setActionProcessingId(rejectingOrder.id);
    setActionMessage(null);

    const result = await rejectOrderPayment(rejectingOrder.id, rejectionReason);

    if (result.success) {
      setActionMessage({
        type: 'success',
        text: `Orden ${rejectingOrder.reference} rechazada y boletos liberados.`,
      });
      setRejectingOrder(null);
      await loadReceipts();
    } else {
      const normalized = normalizeAppError(
        { message: result.error, code: result.code },
        'No se pudo rechazar la orden.'
      );
      logAppError('ReceiptsView.handleConfirmReject', normalized);
      setActionMessage({ type: 'error', text: normalized.userMessage });
    }

    setActionProcessingId(null);
  };

  return (
    <div className={styles.viewContainer}>
      <AdminPageHeader
        title="Validación de Comprobantes"
        description={
          selectedRaffle
            ? `Auditoría visual de transferencias bancarias para: ${selectedRaffle.title}`
            : 'Auditoría visual de transferencias bancarias y confirmación transaccional de ventas.'
        }
        badge={
          selectedRaffle
            ? `${totalCount} en bandeja (${selectedRaffle.status})`
            : `${totalCount} en bandeja`
        }
        actions={
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void loadReceipts()}
            disabled={isLoading}
          >
            <RefreshCw size={16} />
            <span>Refrescar Bandeja</span>
          </button>
        }
      />

      {actionMessage && (
        <div
          className={`${styles.receiptActionBanner} ${
            actionMessage.type === 'success'
              ? styles.receiptActionSuccess
              : styles.receiptActionError
          }`}
        >
          {actionMessage.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className={styles.filterBar}>
        <div className={styles.searchGroup}>
          <Search size={18} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por referencia, cédula o comprador..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className={styles.filterControls}>
          <div className={styles.filterLabel}>
            <Filter size={16} />
            <span className={styles.filterLabelText}>Estado:</span>
          </div>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={handleStatusChange}
          >
            <option value="pending_verification">Por Validar (Pendientes)</option>
            <option value="paid">Aprobadas / Pagadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="ALL">Todos los comprobantes</option>
          </select>
        </div>
      </div>

      {/* Listado / Grid de Comprobantes */}
      {isLoading ? (
        <AdminLoadingState message="Consultando bandeja de comprobantes..." />
      ) : error ? (
        <div className={styles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar comprobantes'}
            message={error}
            isForbidden={isForbidden}
            onRetry={() => void loadReceipts()}
          />
        </div>
      ) : orders.length === 0 ? (
        <div className={styles.cardSection}>
          <AdminEmptyState
            icon={<CheckCircle2 size={36} />}
            title="Bandeja al día"
            description="No hay transferencias pendientes de validación en este momento."
          />
        </div>
      ) : (
        <div className={styles.receiptGrid}>
          {orders.map((ord) => {
            const isProcessing = actionProcessingId === ord.id;
            const hasReceipt = Boolean(ord.receipt_url && ord.receipt_url.trim().length > 0);
            const isPending = ord.status === 'pending_verification' && hasReceipt;

            return (
              <div key={ord.id} className={styles.receiptCard}>
                <div className={styles.receiptCardHeader}>
                  <span className={styles.receiptRef}>{ord.reference}</span>
                  {ord.status === 'pending_verification' && (
                    <span className={styles.badgeWarning}>
                      <Clock size={12} /> Por Validar
                    </span>
                  )}
                  {ord.status === 'paid' && (
                    <span className={styles.badgeSuccess}>
                      <Check size={12} /> Aprobado
                    </span>
                  )}
                  {ord.status === 'rejected' && (
                    <span className={styles.badgeDanger}>
                      <XCircle size={12} /> Rechazado
                    </span>
                  )}
                  {ord.status === 'pending' && (
                    <span className={styles.badgeInfo}>
                      <Clock size={12} /> Reserva
                    </span>
                  )}
                  {ord.status === 'expired' && (
                    <span className={`${styles.badgeDanger} ${styles.badgeCancelled}`}>
                      <AlertCircle size={12} /> Expirada
                    </span>
                  )}
                  {ord.status === 'cancelled' && (
                    <span className={`${styles.badgeNeutral} ${styles.badgeCancelled}`}>
                      <X size={12} /> Cancelada
                    </span>
                  )}
                  {!['pending_verification', 'paid', 'rejected', 'pending', 'expired', 'cancelled'].includes(ord.status) && (
                    <span className={styles.badgeNeutral}>
                      {ord.status}
                    </span>
                  )}
                </div>

                <div className={styles.receiptBuyerInfo}>
                  <span className={styles.receiptBuyerName}>
                    {ord.buyers?.full_name || 'Comprador Desconocido'}
                  </span>
                  <span className={styles.receiptBuyerMeta}>
                    C.C. {ord.buyers?.document_id || 'No registrado'} • Cel: {ord.buyers?.phone || 'No registrado'}
                  </span>
                  <span className={styles.receiptBuyerAmount}>
                    {formatCOP(ord.total_amount)} ({ord.ticket_count}{' '}
                    {ord.ticket_count === 1 ? 'boleto' : 'boletos'})
                  </span>
                </div>

                {/* Miniatura del Comprobante (Acceso Privado Seguro) */}
                {ord.receipt_url ? (
                  <ReceiptThumbnail
                    receiptPath={ord.receipt_url}
                    reference={ord.reference}
                    onSelect={(url) => setSelectedReceiptUrl(url)}
                  />
                ) : (
                  <div className={styles.receiptEmptyBox}>
                    <FileText
                      size={24}
                      className={styles.receiptEmptyBoxIcon}
                    />
                    Sin archivo adjunto
                  </div>
                )}

                {/* Boletos Asociados */}
                <div>
                  <span className={styles.receiptTicketsLabel}>
                    Números Reservados:
                  </span>
                  <div className={styles.receiptTicketsRow}>
                    {(ord.tickets || []).map((t) => (
                      <span key={t.id || t.number} className={styles.receiptTicketTag}>
                        {t.number}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Acciones Administrativas */}
                <div className={styles.receiptActions}>
                  <button
                    type="button"
                    className={`${styles.btnSecondary} ${styles.btnFlex}`}
                    onClick={() => setSelectedReviewOrder(ord)}
                    title="Abrir auditoría completa con datos del comprador y comprobante"
                  >
                    <Eye size={15} />
                    <span>Revisar</span>
                  </button>

                  {isPending && (
                    <>
                      <button
                        type="button"
                        className={styles.btnSuccess}
                        onClick={() => void handleApprove(ord)}
                        disabled={isProcessing}
                        title="Aprobar pago"
                      >
                        <CheckCircle2 size={16} />
                      </button>

                      <button
                        type="button"
                        className={styles.btnDanger}
                        onClick={() => setRejectingOrder(ord)}
                        disabled={isProcessing}
                        title="Rechazar pago"
                      >
                        <XCircle size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barra de Paginación */}
      {!isLoading && totalCount > 0 && (
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            Mostrando <strong>{fromCount}</strong> a <strong>{toCount}</strong> de{' '}
            <strong>{totalCount}</strong> comprobantes
          </div>

          <div className={styles.paginationControls}>
            <div className={styles.pageSizeRow}>
              <span className={styles.pageSizeLabel}>
                Por pág.:
              </span>
              <select
                className={styles.pageSizeSelect}
                value={pageSize}
                onChange={handlePageSizeChange}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
            </div>

            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setPage(1)}
              disabled={page <= 1 || isLoading}
              title="Primera página"
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || isLoading}
              title="Página anterior"
            >
              <ChevronLeft size={16} />
              <span>Anterior</span>
            </button>

            <span className={styles.paginationPageBadge}>
              Pág. {page} de {totalPages}
            </span>

            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || isLoading}
              title="Página siguiente"
            >
              <span>Siguiente</span>
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className={styles.paginationBtn}
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isLoading}
              title="Última página"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Imagen / PDF de Comprobante en Alta Resolución */}
      {selectedReceiptUrl && (
        <div className={styles.adminModalBackdrop} onClick={() => setSelectedReceiptUrl(null)}>
          <div
            className={`${styles.adminModalCard} ${styles.receiptViewerCard}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.receiptModalHeader}>
              <div>
                <h3 className={styles.receiptModalTitle}>
                  Soporte de Transferencia Bancaria
                </h3>
                <span className={styles.receiptModalSubtitle}>
                  Acceso privado y temporal autorizado (15 minutos de vigencia)
                </span>
              </div>
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.btnReceiptModalClose}`}
                onClick={() => setSelectedReceiptUrl(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.receiptViewerContainer}>
              {selectedReceiptUrl.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={selectedReceiptUrl}
                  title="Comprobante PDF"
                  className={styles.receiptIframe}
                />
              ) : (
                <img
                  src={selectedReceiptUrl}
                  alt="Comprobante de pago"
                  className={styles.receiptFullImg}
                />
              )}
            </div>

            <div className={styles.receiptModalFooter}>
              <span className={styles.receiptSecurityNotice}>
                * Nunca se generan enlaces públicos permanentes para proteger los datos bancarios.
              </span>
              <a
                href={selectedReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnSecondary}
              >
                Abrir en Pestaña Nueva
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Motivo de Rechazo */}
      {rejectingOrder && (
        <div className={styles.adminModalBackdrop} onClick={() => setRejectingOrder(null)}>
          <div className={styles.adminModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeaderBetween}>
              <h3 className={styles.rejectModalTitle}>
                <XCircle size={22} />
                Rechazar Orden {rejectingOrder.reference}
              </h3>
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.modalCloseMiniBtn}`}
                onClick={() => setRejectingOrder(null)}
              >
                <X size={16} />
              </button>
            </div>

            <p className={styles.modalDescriptionText}>
              Al rechazar esta orden, los{' '}
              <strong className={styles.highlightText}>{rejectingOrder.ticket_count} boletos</strong>{' '}
              reservados serán liberados inmediatamente a la plataforma pública para que otros
              usuarios puedan adquirirlos.
            </p>

            <div>
              <label className={styles.modalFieldLabel}>
                Motivo del Rechazo:
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className={styles.modalReasonTextarea}
              />
            </div>

            <div className={styles.modalFooterActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setRejectingOrder(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => void handleConfirmReject()}
                disabled={Boolean(actionProcessingId)}
              >
                <XCircle size={16} />
                <span>Confirmar Rechazo y Liberar Boletos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Principal de Auditoría y Verificación */}
      <AdminOrderReviewModal
        order={selectedReviewOrder}
        isOpen={Boolean(selectedReviewOrder)}
        onClose={() => setSelectedReviewOrder(null)}
        onOrderUpdated={loadReceipts}
      />

      {/* Modal de Confirmación de Aprobación de Pago */}
      <AdminConfirmPaymentModal
        isOpen={Boolean(approvingOrder)}
        order={approvingOrder}
        isProcessing={Boolean(actionProcessingId)}
        onConfirm={handleConfirmApprove}
        onClose={() => setApprovingOrder(null)}
      />
    </div>
  );
};
