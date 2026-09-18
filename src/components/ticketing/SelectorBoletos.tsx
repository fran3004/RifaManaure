import React, { useState, useMemo } from 'react';
import { useTicketCart } from '@/context/useTicketCart';
import {
  Ticket,
  Search,
  Dices,
  RotateCcw,
  CheckCircle,
  Clock,
  Lock,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { GanadorShowcase } from './GanadorShowcase';
import styles from './SelectorBoletos.module.css';

type FilterType = 'all' | 'available' | 'selected';

const RANGES = [
  { label: '000 - 199', min: 0, max: 199 },
  { label: '200 - 399', min: 200, max: 399 },
  { label: '400 - 599', min: 400, max: 599 },
  { label: '600 - 799', min: 600, max: 799 },
  { label: '800 - 999', min: 800, max: 999 },
];

export const SelectorBoletos: React.FC = () => {
  const {
    raffle,
    winner,
    tickets,
    selectedTickets,
    isLoading,
    unitPrice,
    totalAmount,
    maxTicketsPerBuyer,
    toggleTicketSelection,
    selectRandomTickets,
    clearSelection,
    openCheckout,
  } = useTicketCart();

  const isRaffleActive = raffle?.status === 'active';
  const isRafflePaused = raffle?.status === 'paused';
  const isRaffleClosed = raffle?.status === 'closed' || raffle?.status === 'finished';
  const isMaxLimitReached = selectedTickets.length >= maxTicketsPerBuyer;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedRange, setSelectedRange] = useState<number>(0);

  // Estadísticas en tiempo real
  const stats = useMemo(() => {
    const total = tickets.length || 1000;
    const available = tickets.filter((t) => t.status === 'available').length;
    const reserved = tickets.filter((t) => t.status === 'reserved').length;
    const sold = tickets.filter((t) => t.status === 'sold').length;
    return { total, available, reserved, sold };
  }, [tickets]);

  // Boletos filtrados
  const filteredTickets = useMemo(() => {
    let list = [...tickets];

    // Búsqueda por texto (ej. "7" o "007")
    if (searchTerm.trim() !== '') {
      const cleanTerm = searchTerm.trim();
      return list.filter((t) => t.number.includes(cleanTerm));
    }

    // Filtro por estado
    if (filterType === 'available') {
      list = list.filter((t) => t.status === 'available');
    } else if (filterType === 'selected') {
      list = list.filter((t) => selectedTickets.includes(t.number));
    }

    // Filtro por rango numérico
    const curRange = RANGES[selectedRange];
    if (curRange) {
      list = list.filter((t) => {
        const num = parseInt(t.number, 10);
        return num >= curRange.min && num <= curRange.max;
      });
    }

    return list;
  }, [tickets, searchTerm, filterType, selectedRange, selectedTickets]);

  // Si la edición cuenta con ganador oficial registrado, mostrar la celebración en lugar del selector
  if (winner) {
    return <GanadorShowcase winner={winner} />;
  }

  return (
    <section id="boletos" className={styles.section}>
      <div className="container">
        {/* Cabecera del Selector */}
        <div className={styles.header}>
          <div className={styles.badge}>
            <Ticket size={16} />
            <span>Matriz de Boletos Oficial (000 - 999)</span>
          </div>
          <h2 className={styles.title}>
            Elige tus <span className="highlight-text">Números de la Suerte</span>
          </h2>
          <p className={styles.subtitle}>
            Haz clic en los números que deseas comprar o usa el botón de selección aleatoria. Valor
            por boleto: <strong>{unitPrice > 0 ? formatCOP(unitPrice) : '...'}</strong>.
          </p>

          {/* Banner de Sorteo Pausado */}
          {isRafflePaused && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                padding: '1rem 1.25rem',
                borderRadius: '12px',
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.92rem',
                textAlign: 'left',
              }}
            >
              <Clock size={20} style={{ flexShrink: 0, color: '#f59e0b' }} />
              <div>
                <strong style={{ display: 'block', color: '#fde68a', marginBottom: '0.2rem' }}>
                  Sorteo Temporalmente Pausado
                </strong>
                <span>
                  La venta y reserva de boletos se encuentra pausada por el equipo administrativo.
                  No se admiten nuevas compras en este momento.
                </span>
              </div>
            </div>
          )}

          {/* Banner de Sorteo Finalizado */}
          {isRaffleClosed && (
            <div
              style={{
                background: 'rgba(100, 116, 139, 0.1)',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                color: '#cbd5e1',
                padding: '1rem 1.25rem',
                borderRadius: '12px',
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.92rem',
                textAlign: 'left',
              }}
            >
              <Lock size={20} style={{ flexShrink: 0, color: '#94a3b8' }} />
              <div>
                <strong style={{ display: 'block', color: '#f1f5f9', marginBottom: '0.2rem' }}>
                  Edición de Rifa Concluida
                </strong>
                <span>
                  Esta edición ha finalizado. Puedes consultar tus números ganadores en la sección
                  de verificación.
                </span>
              </div>
            </div>
          )}

          {/* Estadísticas de Disponibilidad */}
          <div className={styles.statsStrip}>
            <div className={styles.statItem}>
              <span className={styles.statDotAvailable} />
              <span>
                <strong>{stats.available}</strong> Disponibles
              </span>
            </div>
            <div className={styles.statItem}>
              <span
                className={isMaxLimitReached ? styles.statDotSelectedMax : styles.statDotSelected}
              />
              <span>
                <strong>{selectedTickets.length}</strong>
                {maxTicketsPerBuyer ? `/${maxTicketsPerBuyer}` : ''} Seleccionados
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statDotReserved} />
              <span>
                <strong>{stats.reserved}</strong> En Reserva
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statDotSold} />
              <span>
                <strong>{stats.sold}</strong> Vendidos
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Control, Búsqueda y Botones de la Suerte */}
        <div className={styles.controlPanel}>
          {/* Buscador */}
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar número (ej: 045, 777)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
              maxLength={3}
              disabled={!isRaffleActive}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className={styles.clearSearchBtn}
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Botones de Azar */}
          <div className={styles.randomButtons}>
            <span className={styles.randomLabel}>
              <Dices size={16} /> Azar:
            </span>
            <button
              type="button"
              className={styles.randomBtn}
              onClick={() => selectRandomTickets(1)}
              disabled={!isRaffleActive}
            >
              +1
            </button>
            <button
              type="button"
              className={styles.randomBtn}
              onClick={() => selectRandomTickets(2)}
              disabled={!isRaffleActive}
            >
              +2
            </button>
            <button
              type="button"
              className={styles.randomBtn}
              onClick={() => selectRandomTickets(5)}
              disabled={!isRaffleActive}
            >
              +5
            </button>
            <button
              type="button"
              className={styles.randomBtn}
              onClick={() => selectRandomTickets(10)}
              disabled={!isRaffleActive}
            >
              +10
            </button>
            {selectedTickets.length > 0 && (
              <button type="button" className={styles.clearBtn} onClick={clearSelection}>
                <RotateCcw size={14} /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Pestañas de Rango de Boletos (Paginación por Bloques) */}
        {!searchTerm && (
          <div className={styles.rangeTabs}>
            <div className={styles.rangeButtons}>
              {RANGES.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.rangeBtn} ${selectedRange === idx ? styles.rangeBtnActive : ''}`}
                  onClick={() => setSelectedRange(idx)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Filtros Rápidos */}
            <div className={styles.filterGroup}>
              <Filter size={14} />
              <button
                type="button"
                className={`${styles.filterTag} ${filterType === 'all' ? styles.filterTagActive : ''}`}
                onClick={() => setFilterType('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`${styles.filterTag} ${filterType === 'available' ? styles.filterTagActive : ''}`}
                onClick={() => setFilterType('available')}
              >
                Solo Libres
              </button>
              <button
                type="button"
                className={`${styles.filterTag} ${filterType === 'selected' ? styles.filterTagActive : ''}`}
                onClick={() => setFilterType('selected')}
              >
                Mis Boletos ({selectedTickets.length})
              </button>
            </div>
          </div>
        )}

        {/* Grilla de Boletos */}
        {isLoading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <p>Sincronizando boletos con la base de datos de Supabase...</p>
          </div>
        ) : (
          <div className={styles.ticketGrid}>
            {filteredTickets.map((ticket) => {
              const isSelected = selectedTickets.includes(ticket.number);
              const isAvailable = ticket.status === 'available';
              const isReserved = ticket.status === 'reserved';
              const isSold = ticket.status === 'sold';

              let ticketClass = styles.ticketAvailable;
              let statusLabel = 'Disponible';

              if (isSelected) {
                ticketClass = styles.ticketSelected;
                statusLabel = 'Seleccionado';
              } else if (isReserved) {
                ticketClass = styles.ticketReserved;
                statusLabel = 'En proceso de pago';
              } else if (isSold) {
                ticketClass = styles.ticketSold;
                statusLabel = 'Vendido';
              }

              return (
                <button
                  key={ticket.id || ticket.number}
                  type="button"
                  className={`${styles.ticketCard} ${ticketClass}`}
                  onClick={() => toggleTicketSelection(ticket.number)}
                  disabled={(!isAvailable && !isSelected) || !isRaffleActive}
                  title={`Número ${formatTicketNumber(ticket.number)} - ${statusLabel}`}
                  aria-label={`Boleto número ${ticket.number}, estado: ${statusLabel}`}
                >
                  <span className={styles.ticketNumber}>{ticket.number}</span>
                  {isSelected && <CheckCircle size={12} className={styles.ticketIcon} />}
                  {isReserved && !isSelected && <Clock size={12} className={styles.ticketIcon} />}
                  {isSold && !isSelected && <Lock size={12} className={styles.ticketIcon} />}
                </button>
              );
            })}
          </div>
        )}

        {filteredTickets.length === 0 && !isLoading && (
          <div className={styles.emptyResults}>
            <p>No se encontraron boletos que coincidan con el filtro seleccionado.</p>
            <button
              type="button"
              className={styles.resetFilterBtn}
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
              }}
            >
              Restablecer filtros
            </button>
          </div>
        )}
      </div>

      {/* Barra de Carrito Flotante Inferior */}
      {selectedTickets.length > 0 && (
        <aside className={styles.floatingCart} aria-label="Resumen de compra">
          <div className={`container ${styles.cartContainer}`}>
            <div className={styles.cartInfo}>
              <div className={styles.cartCountBadge}>
                <span>{selectedTickets.length}</span>{' '}
                {selectedTickets.length === 1 ? 'Boleto' : 'Boletos'}
              </div>
              {isMaxLimitReached && (
                <div className={styles.limitReachedBadge}>
                  <span>
                    Límite ({maxTicketsPerBuyer}/{maxTicketsPerBuyer})
                  </span>
                </div>
              )}
              <div className={styles.cartNumbersList}>
                {selectedTickets.map((num) => (
                  <span key={num} className={styles.miniTag}>
                    {num}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.cartCheckout}>
              <div className={styles.cartTotalBox}>
                <span className={styles.cartTotalLabel}>Total a Pagar:</span>
                <strong className={styles.cartTotalValue}>{formatCOP(totalAmount)}</strong>
              </div>

              <button type="button" className={styles.checkoutBtn} onClick={openCheckout}>
                <span>Comprar Ahora</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </aside>
      )}
    </section>
  );
};
