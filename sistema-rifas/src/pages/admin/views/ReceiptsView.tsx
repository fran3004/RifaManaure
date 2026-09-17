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

const ReceiptThumbnail: React.FC<ReceiptThumbnailProps> = ({ receiptPath, reference, onSelect }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isPdf = receiptPath.toLowerCase().endsWith('.pdf') || receiptPath.toLowerCase().includes('.pdf?');

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
      <div style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: 'var(--bg-main, #0a1410)', borderRadius: 'var(--radius-md, 10px)', color: 'var(--text-muted, #5e7a6f)', fontSize: '0.8rem' }}>
        <Clock size={18} style={{ display: 'block', margin: '0 auto 0.3rem auto' }} />
        Generando acceso seguro...
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: 'var(--bg-main, #0a1410)', borderRadius: 'var(--radius-md, 10px)', color: '#ef4444', fontSize: '0.8rem' }}>
        <AlertTriangle size={18} style={{ display: 'block', margin: '0 auto 0.3rem auto' }} />
        Acceso no disponible
      </div>
    );
  }

  if (isPdf) {
    return (
      <div
        className={styles.receiptImageThumbWrapper}
        onClick={() => onSelect(signedUrl)}
        title="Clic para ver comprobante PDF"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', backgroundColor: 'var(--bg-main, #0a1410)', cursor: 'pointer' }}
      >
        <FileText size={34} color="#f59e0b" />
        <span style={{ fontSize: '0.75rem', color: '#9cb5ab', marginTop: '0.35rem', fontWeight: 600 }}>Documento PDF</span>
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
      <img src={signedUrl} alt={`Comprobante de orden ${reference}`} className={styles.receiptImageThumb} />
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
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('pending_verification');
  const [selectedReviewOrder, setSelectedReviewOrder] = useState<OrderWithDetails | null>(null);
  const { selectedRaffleId, selectedRaffle } = useAdminRaffle();
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [approvingOrder, setApprovingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<OrderWithDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('Comprobante ilegible o no coincide con los valores recibidos');
  const [actionProcessingId, setActionProcessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    } catch (err: unknown) {
      console.error('Error al cargar comprobantes:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar los comprobantes de pago');
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
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error('Error al cargar comprobantes:', err);
          setError(err instanceof Error ? err.message : 'Error al cargar los comprobantes de pago');
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
    setApprovingOrder(order);
  };

  const handleConfirmApprove = async () => {
    if (!approvingOrder) return;

    setActionProcessingId(approvingOrder.id);
    setActionMessage(null);

    const result = await approveOrderPayment(approvingOrder.id);

    if (result.success) {
      setActionMessage({ type: 'success', text: `¡Orden ${approvingOrder.reference} aprobada! Boletos vendidos confirmados.` });
      setApprovingOrder(null);
      await loadReceipts();
    } else {
      setActionMessage({ type: 'error', text: result.error || 'No se pudo aprobar el pago.' });
    }

    setActionProcessingId(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;

    setActionProcessingId(rejectingOrder.id);
    setActionMessage(null);

    const result = await rejectOrderPayment(rejectingOrder.id, rejectionReason);

    if (result.success) {
      setActionMessage({ type: 'success', text: `Orden ${rejectingOrder.reference} rechazada y boletos liberados.` });
      setRejectingOrder(null);
      await loadReceipts();
    } else {
      setActionMessage({ type: 'error', text: result.error || 'No se pudo rechazar la orden.' });
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
        badge={selectedRaffle ? `${totalCount} en bandeja (${selectedRaffle.status})` : `${totalCount} en bandeja`}
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
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md, 10px)',
            backgroundColor: actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${actionMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: actionMessage.type === 'success' ? '#34d399' : '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary, #9cb5ab)' }}>
            <Filter size={16} />
            <span style={{ fontSize: '0.85rem' }}>Estado:</span>
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
            title="Error al cargar comprobantes"
            message={error}
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
            const isPending = ord.status === 'pending_verification' || ord.status === 'pending';

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
                </div>

                <div className={styles.receiptBuyerInfo}>
                  <span className={styles.receiptBuyerName}>
                    {ord.buyers?.full_name || 'Comprador Desconocido'}
                  </span>
                  <span className={styles.receiptBuyerMeta}>
                    C.C. {ord.buyers?.document_id || 'N/A'} • Cel: {ord.buyers?.phone || 'N/A'}
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-brand-accent, #f59e0b)', marginTop: '0.2rem' }}>
                    {formatCOP(ord.total_amount)} ({ord.ticket_count} {ord.ticket_count === 1 ? 'boleto' : 'boletos'})
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
                  <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: 'var(--bg-main, #0a1410)', borderRadius: 'var(--radius-md, 10px)', color: 'var(--text-muted, #5e7a6f)', fontSize: '0.85rem' }}>
                    <FileText size={24} style={{ display: 'block', margin: '0 auto 0.4rem auto' }} />
                    Sin archivo adjunto
                  </div>
                )}

                {/* Boletos Asociados */}
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted, #5e7a6f)', marginBottom: '0.3rem', textTransform: 'uppercase', fontWeight: 600 }}>
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
                    className={styles.btnSecondary}
                    style={{ flex: 1 }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9cb5ab)' }}>Por pág.:</span>
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
          <div className={styles.adminModalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#f3f7f5', fontSize: '1.2rem', textAlign: 'left' }}>Soporte de Transferencia Bancaria</h3>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#9cb5ab', textAlign: 'left' }}>Acceso privado y temporal autorizado (15 minutos de vigencia)</span>
              </div>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setSelectedReceiptUrl(null)}
                style={{ padding: '0.4rem 0.6rem' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', backgroundColor: '#000', borderRadius: 'var(--radius-md, 10px)', padding: '0.5rem' }}>
              {selectedReceiptUrl.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={selectedReceiptUrl}
                  title="Comprobante PDF"
                  style={{ width: '100%', height: '65vh', border: 'none', borderRadius: 'var(--radius-sm, 6px)' }}
                />
              ) : (
                <img
                  src={selectedReceiptUrl}
                  alt="Comprobante de pago"
                  style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 'var(--radius-sm, 6px)' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#9cb5ab' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, color: '#fca5a5', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <XCircle size={22} />
                Rechazar Orden {rejectingOrder.reference}
              </h3>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setRejectingOrder(null)}
                style={{ padding: '0.35rem 0.5rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary, #9cb5ab)', fontSize: '0.9rem', margin: 0 }}>
              Al rechazar esta orden, los <strong style={{ color: '#f59e0b' }}>{rejectingOrder.ticket_count} boletos</strong> reservados serán liberados inmediatamente a la plataforma pública para que otros usuarios puedan adquirirlos.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2f0ea', marginBottom: '0.5rem' }}>
                Motivo del Rechazo:
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-main, #0a1410)',
                  border: '1px solid var(--border-subtle, rgba(156, 181, 171, 0.2))',
                  borderRadius: 'var(--radius-md, 10px)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
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
