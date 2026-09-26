import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Edit2,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/common/AdminPageHeader';
import { AdminEmptyState } from '@/components/admin/common/AdminEmptyState';
import { AdminLoadingState } from '@/components/admin/common/AdminLoadingState';
import { AdminErrorState } from '@/components/admin/common/AdminErrorState';
import { AdminEditBuyerModal } from '@/components/admin/buyers/AdminEditBuyerModal';
import { AdminBuyerOrdersModal } from '@/components/admin/buyers/AdminBuyerOrdersModal';
import { fetchBuyersPaginated, type BuyerItem } from '@/services/buyerService';
import { useAdminRaffle } from '@/context/AdminRaffleContext';
import { formatCOP } from '@/lib/utils';
import { normalizeAppError, logAppError } from '@/lib/errorHandling';
import commonStyles from './AdminViews.module.css';
import styles from './BuyersView.module.css';

export const BuyersView: React.FC = () => {
  // Contexto de la rifa activa / seleccionada en el panel
  const { selectedRaffleId, selectedRaffle, isLoadingRaffles } = useAdminRaffle();

  const [buyers, setBuyers] = useState<BuyerItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modales
  const [editingBuyer, setEditingBuyer] = useState<BuyerItem | null>(null);
  const [viewingOrdersBuyer, setViewingOrdersBuyer] = useState<BuyerItem | null>(null);

  // Mensaje de feedback / toast
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

  // Reiniciar paginación a página 1 si cambia la rifa seleccionada
  const [prevRaffleId, setPrevRaffleId] = useState(selectedRaffleId);
  if (prevRaffleId !== selectedRaffleId) {
    setPrevRaffleId(selectedRaffleId);
    setPage(1);
  }

  const loadBuyers = useCallback(async () => {
    if (!selectedRaffleId) {
      setBuyers([]);
      setTotalCount(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchBuyersPaginated({
        searchTerm,
        page,
        pageSize,
        raffleId: selectedRaffleId,
      });

      setBuyers(res.buyers);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      setIsForbidden(false);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err, 'Error al cargar compradores');
      logAppError('BuyersView.loadBuyers', normalized);
      setError(normalized.userMessage);
      setIsForbidden(normalized.kind === 'FORBIDDEN' || normalized.kind === 'UNAUTHORIZED');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, page, pageSize, selectedRaffleId]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (!selectedRaffleId) {
        if (isMounted) {
          setBuyers([]);
          setTotalCount(0);
          setTotalPages(1);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchBuyersPaginated({
          searchTerm,
          page,
          pageSize,
          raffleId: selectedRaffleId,
        });
        if (isMounted) {
          setBuyers(res.buyers);
          setTotalCount(res.totalCount);
          setTotalPages(res.totalPages);
          setIsForbidden(false);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const normalized = normalizeAppError(err, 'Error al cargar compradores');
          logAppError('BuyersView.init', normalized);
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
  }, [searchTerm, page, pageSize, selectedRaffleId]);

  // Manejador de búsqueda con reinicio de página
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  // Copiar cédula al portapapeles
  const handleCopyDoc = (docId: string) => {
    navigator.clipboard.writeText(docId);
    setCopiedDocId(docId);
    setTimeout(() => {
      setCopiedDocId(null);
    }, 2000);
  };

  // Callback al guardar cambios de edición
  const handleBuyerUpdated = (updatedBuyer: BuyerItem) => {
    setBuyers((prev) =>
      prev.map((b) => (b.id === updatedBuyer.id ? { ...b, ...updatedBuyer } : b))
    );
    setFeedback({
      type: 'success',
      message: `Datos de ${updatedBuyer.full_name} actualizados con éxito en la plataforma.`,
    });
  };

  // Si está cargando el contexto de rifas y aún no tenemos el ID
  if (isLoadingRaffles && !selectedRaffleId) {
    return (
      <div className={styles.viewContainer}>
        <AdminPageHeader
          title="Gestión de Compradores"
          description="Supervisión de clientes, trazabilidad de compras y actualización segura de datos de contacto."
          badge="Cargando..."
        />
        <div className={commonStyles.cardSection}>
          <AdminLoadingState message="Cargando información de la rifa seleccionada..." />
        </div>
      </div>
    );
  }

  // Si no hay rifa seleccionada o configurada en el panel
  if (!selectedRaffleId) {
    return (
      <div className={styles.viewContainer}>
        <AdminPageHeader
          title="Gestión de Compradores"
          description="Supervisión de clientes, trazabilidad de compras y actualización segura de datos de contacto."
          badge="0 compradores"
        />
        <div className={commonStyles.cardSection}>
          <AdminEmptyState
            icon={<Users size={40} />}
            title="Ninguna rifa seleccionada"
            description="Por favor selecciona o activa una rifa desde el panel para consultar y gestionar a sus compradores."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewContainer}>
      {/* Encabezado de Página con contexto dinámico de la rifa */}
      <AdminPageHeader
        title="Gestión de Compradores"
        description={
          selectedRaffle
            ? `Supervisión de clientes y compras para: ${selectedRaffle.title}`
            : 'Supervisión de clientes, trazabilidad de compras y actualización segura de datos de contacto.'
        }
        badge={
          selectedRaffle
            ? `${totalCount} compradores en esta edición`
            : `${totalCount} compradores registrados`
        }
        actions={
          <button
            type="button"
            className={commonStyles.btnPrimary}
            onClick={loadBuyers}
            disabled={isLoading}
            title="Refrescar listado de compradores de esta rifa"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        }
      />

      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`${styles.feedbackToast} ${
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          <div className={styles.feedbackContent}>
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            className={styles.feedbackCloseBtn}
            onClick={() => setFeedback(null)}
            title="Cerrar notificación"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <div className={styles.filterToolbar}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por cédula, nombre, teléfono, correo o ciudad..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <div className={styles.toolbarActions}>
          {selectedRaffle && (
            <div className={styles.raffleIndicatorBadge} title="Rifa actualmente en gestión">
              <span className={styles.raffleDot} />
              <span className={styles.raffleIndicatorLabel}>Edición:</span>
              <strong className={styles.raffleIndicatorTitle}>{selectedRaffle.title}</strong>
            </div>
          )}
          <span className={styles.toolbarSummary}>
            Mostrando <strong>{buyers.length}</strong> de <strong>{totalCount}</strong> clientes
          </span>
        </div>
      </div>

      {/* Contenedor Principal / Tabla */}
      {isLoading ? (
        <div className={commonStyles.cardSection}>
          <AdminLoadingState message="Cargando compradores de la rifa..." />
        </div>
      ) : error ? (
        <div className={commonStyles.cardSection}>
          <AdminErrorState
            title={isForbidden ? 'Acceso Restringido' : 'Error al cargar compradores'}
            message={error}
            isForbidden={isForbidden}
            onRetry={() => void loadBuyers()}
          />
        </div>
      ) : buyers.length === 0 ? (
        <AdminEmptyState
          icon={<Users size={40} />}
          title="Sin compradores en esta rifa"
          description={
            searchTerm
              ? 'No se encontraron compradores que coincidan con la búsqueda en esta edición.'
              : `Aún no se han registrado compras para la edición "${selectedRaffle?.title || 'seleccionada'}".`
          }
        />
      ) : (
        <div className={styles.tableCard}>
          <div className={styles.tableScrollWrapper}>
            <table className={styles.buyersTable}>
              <thead>
                <tr>
                  <th className={styles.thBuyer}>Comprador</th>
                  <th className={styles.thPhone}>Teléfono</th>
                  <th className={styles.thEmail}>Correo Electrónico</th>
                  <th className={styles.thCity}>Ciudad</th>
                  <th className={styles.thOrders}>Órdenes</th>
                  <th className={styles.thSpent}>Total Invertido</th>
                  <th className={styles.thActions}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((buyer) => (
                  <tr key={buyer.id} className={styles.buyersTableRow}>
                    {/* 1. Comprador */}
                    <td>
                      <div className={styles.buyerCell}>
                        <strong className={styles.buyerName}>{buyer.full_name}</strong>
                        <div className={styles.docGroup}>
                          <span className={styles.docBadge}>C.C. {buyer.document_id}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyDoc(buyer.document_id)}
                            className={`${styles.btnCopyDoc} ${
                              copiedDocId === buyer.document_id ? styles.btnCopyDocSuccess : ''
                            }`}
                            title="Copiar cédula"
                          >
                            {copiedDocId === buyer.document_id ? (
                              <Check size={12} />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* 2. Teléfono */}
                    <td>
                      {buyer.phone ? (
                        <a
                          href={`https://wa.me/57${buyer.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.phoneLink}
                          title="Enviar mensaje por WhatsApp"
                        >
                          <span>{buyer.phone}</span>
                        </a>
                      ) : (
                        <span className={styles.phoneNotAvailable}>No registrado</span>
                      )}
                    </td>

                    {/* 3. Correo */}
                    <td>
                      <span className={styles.emailText} title={buyer.email}>
                        {buyer.email || 'No registrado'}
                      </span>
                    </td>

                    {/* 4. Ciudad */}
                    <td>
                      <span className={styles.cityText}>{buyer.city || 'Manaure'}</span>
                    </td>

                    {/* 5. Órdenes */}
                    <td className={styles.tdCenter}>
                      <span
                        className={`${styles.ordersCountBadge} ${
                          (buyer.paid_orders_count || 0) > 0 ? styles.ordersCountBadgeActive : ''
                        }`}
                        title={`${buyer.paid_orders_count || 0} órdenes aprobadas de ${
                          buyer.total_orders_count || 0
                        } totales en esta rifa`}
                      >
                        {buyer.paid_orders_count || 0} / {buyer.total_orders_count || 0}
                      </span>
                    </td>

                    {/* 6. Total Invertido */}
                    <td>
                      <strong className={styles.spentAmount}>
                        {formatCOP(buyer.total_spent || 0)}
                      </strong>
                    </td>

                    {/* 7. Acciones */}
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.btnActionHistory}
                          onClick={() => setViewingOrdersBuyer(buyer)}
                          title="Ver historial de órdenes de este comprador en esta rifa"
                        >
                          <ShoppingBag size={13} />
                          <span>Historial</span>
                        </button>
                        <button
                          type="button"
                          className={styles.btnActionEdit}
                          onClick={() => setEditingBuyer(buyer)}
                          title="Editar datos de contacto del comprador"
                        >
                          <Edit2 size={13} />
                          <span>Editar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Barra de Paginación Integrada */}
          <div className={styles.tableFooterPagination}>
            <div className={commonStyles.paginationInfo}>
              Mostrando <strong>{buyers.length}</strong> de <strong>{totalCount}</strong>{' '}
              compradores en esta rifa
            </div>
            <div className={commonStyles.paginationControls}>
              <div className={styles.pageSizeWrapper}>
                <span className={styles.pageSizeLabel}>Por pág.:</span>
                <select
                  className={commonStyles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <button
                type="button"
                className={commonStyles.paginationBtn}
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={16} />
                <span>Anterior</span>
              </button>
              <span className={commonStyles.paginationPageBadge}>
                Pág. {page} de {totalPages}
              </span>
              <button
                type="button"
                className={commonStyles.paginationBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                <span>Siguiente</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición de Comprador */}
      <AdminEditBuyerModal
        buyer={editingBuyer}
        isOpen={Boolean(editingBuyer)}
        onClose={() => setEditingBuyer(null)}
        onSuccess={handleBuyerUpdated}
      />

      {/* Modal de Historial de Órdenes filtrado estrictamente por la rifa actual */}
      <AdminBuyerOrdersModal
        buyer={viewingOrdersBuyer}
        isOpen={Boolean(viewingOrdersBuyer)}
        onClose={() => setViewingOrdersBuyer(null)}
        raffleId={selectedRaffleId}
        raffleTitle={selectedRaffle?.title}
      />
    </div>
  );
};
