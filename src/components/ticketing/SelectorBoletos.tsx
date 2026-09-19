import React, { useState, useMemo } from 'react';
import { useTicketCart } from '@/context/useTicketCart';
import {
  Ticket,
  Search,
  Sparkles,
  RotateCcw,
  CheckCircle,
  Clock,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { SectionHeader, Button } from '@/components/public/ui';
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
    ticketStats: stats,
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
    <section id="boletos" className={styles.section} aria-labelledby="titulo-boletos">
      <div className="container">
        {/* Cabecera del Selector */}
        <SectionHeader
          id="titulo-boletos"
          badge="Tu Oportunidad"
          icon={<Ticket size={16} aria-hidden="true" />}
          title={
            <>
              Elige Tus <span className="highlight-text">Números de la Suerte</span>
            </>
          }
          subtitle={
            <>
              Haz clic en los números que deseas comprar o usa la selección aleatoria. Valor
              por boleto: <strong>{unitPrice > 0 ? formatCOP(unitPrice) : '...'}</strong>.
            </>
          }
        >
          {/* Banner de Sorteo Pausado */}
          {isRafflePaused && (
            <div className={styles.pausedBanner} role="status">
              <Clock size={20} aria-hidden="true" className={styles.bannerIcon} />
              <div>
                <strong className={styles.bannerTitle}>Sorteo Temporalmente Pausado</strong>
                <span className={styles.bannerMessage}>
                  La venta y reserva de boletos se encuentra pausada por el equipo administrativo.
                  No se admiten nuevas compras en este momento.
                </span>
              </div>
            </div>
          )}

          {/* Banner de Sorteo Finalizado */}
          {isRaffleClosed && (
            <div className={styles.closedBanner} role="status">
              <Lock size={20} aria-hidden="true" className={styles.bannerIcon} />
              <div>
                <strong className={styles.bannerTitle}>Edición de Rifa Concluida</strong>
                <span className={styles.bannerMessage}>
                  Esta edición ha finalizado. Puedes consultar tus números ganadores en la sección
                  de verificación.
                </span>
              </div>
            </div>
          )}

          {/* Barra de Estadísticas */}
          <div
            className={styles.statsStrip}
            role="region"
            aria-label="Estadísticas de disponibilidad de boletos"
          >
            <div className={styles.statItem}>
              <span className={styles.statDotAvailable} aria-hidden="true" />
              <span className={styles.statContent}>
                <strong className={styles.statValue}>{stats.available}</strong>
                <span className={styles.statLabel}>Disponibles</span>
              </span>
            </div>
            <div className={styles.statItem}>
              <span
                className={isMaxLimitReached ? styles.statDotSelectedMax : styles.statDotSelected}
                aria-hidden="true"
              />
              <span className={styles.statContent}>
                <strong className={styles.statValue}>
                  {selectedTickets.length}
                  {maxTicketsPerBuyer ? `/${maxTicketsPerBuyer}` : ''}
                </strong>
                <span className={styles.statLabel}>Seleccionados</span>
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statDotReserved} aria-hidden="true" />
              <span className={styles.statContent}>
                <strong className={styles.statValue}>{stats.reserved}</strong>
                <span className={styles.statLabel}>En reserva</span>
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statDotSold} aria-hidden="true" />
              <span className={styles.statContent}>
                <strong className={styles.statValue}>{stats.sold}</strong>
                <span className={styles.statLabel}>Vendidos</span>
              </span>
            </div>
          </div>
        </SectionHeader>

        {/* Barra de Control, Búsqueda y Azar */}
        <div className={styles.controlPanel}>
          {/* Buscador */}
          <div className={styles.searchBox}>
            <label htmlFor="busqueda-boletos" className="visually-hidden">
              Buscar número de boleto
            </label>
            <Search size={18} aria-hidden="true" className={styles.searchIcon} />
            <input
              id="busqueda-boletos"
              type="text"
              placeholder="Buscar número (ej: 045, 777)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
              maxLength={3}
              disabled={!isRaffleActive}
              aria-label="Buscar número de boleto"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className={styles.clearSearchBtn}
                aria-label="Borrar término de búsqueda"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Botones de Azar */}
          <div className={styles.randomButtons}>
            <div className={styles.randomLabel}>
              <Sparkles size={16} aria-hidden="true" />
              <span>Azar:</span>
            </div>
            <div className={styles.randomActionGroup}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={styles.randomBtn}
                onClick={() => selectRandomTickets(1)}
                disabled={!isRaffleActive || isMaxLimitReached}
                aria-label="Seleccionar 1 boleto al azar"
              >
                +1
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={styles.randomBtn}
                onClick={() => selectRandomTickets(2)}
                disabled={!isRaffleActive || isMaxLimitReached}
                aria-label="Seleccionar 2 boletos al azar"
              >
                +2
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={styles.randomBtn}
                onClick={() => selectRandomTickets(5)}
                disabled={!isRaffleActive || isMaxLimitReached}
                aria-label="Seleccionar 5 boletos al azar"
              >
                +5
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={styles.randomBtn}
                onClick={() => selectRandomTickets(10)}
                disabled={!isRaffleActive || isMaxLimitReached}
                aria-label="Seleccionar 10 boletos al azar"
              >
                +10
              </Button>
            </div>
            {selectedTickets.length > 0 && (
              <Button
                type="button"
                variant="danger-soft"
                size="sm"
                className={styles.clearBtn}
                onClick={clearSelection}
                leftIcon={<RotateCcw size={14} aria-hidden="true" />}
                aria-label="Limpiar selección de boletos"
              >
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Filtros de Rango y Disponibilidad como Chips */}
        {!searchTerm && (
          <div className={styles.filterBar}>
            <div className={styles.rangeChips} role="toolbar" aria-label="Filtrar por rango de boletos">
              {RANGES.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.filterChip} ${selectedRange === idx ? styles.filterChipActive : ''}`}
                  onClick={() => setSelectedRange(idx)}
                  aria-pressed={selectedRange === idx}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className={styles.statusChips} role="toolbar" aria-label="Filtrar por disponibilidad">
              <button
                type="button"
                className={`${styles.filterChip} ${filterType === 'all' ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType('all')}
                aria-pressed={filterType === 'all'}
              >
                Todos
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${filterType === 'available' ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType('available')}
                aria-pressed={filterType === 'available'}
              >
                Solo Libres
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${filterType === 'selected' ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType('selected')}
                aria-pressed={filterType === 'selected'}
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
              let statusLabel = 'disponible';

              if (isSelected) {
                ticketClass = styles.ticketSelected;
                statusLabel = 'seleccionado';
              } else if (isReserved) {
                ticketClass = styles.ticketReserved;
                statusLabel = 'en reserva';
              } else if (isSold) {
                ticketClass = styles.ticketSold;
                statusLabel = 'vendido';
              }

              return (
                <button
                  key={ticket.id || ticket.number}
                  type="button"
                  className={`${styles.ticketCard} ${ticketClass}`}
                  onClick={() => toggleTicketSelection(ticket.number)}
                  disabled={(!isAvailable && !isSelected) || !isRaffleActive}
                  aria-pressed={isSelected}
                  aria-disabled={!isAvailable && !isSelected ? true : undefined}
                  title={`Número ${formatTicketNumber(ticket.number)} - ${statusLabel}`}
                  aria-label={`Boleto ${ticket.number}, ${statusLabel}`}
                >
                  <span className={styles.ticketNumber}>{ticket.number}</span>
                  {isSelected && <CheckCircle size={11} aria-hidden="true" className={styles.ticketIcon} />}
                  {isReserved && !isSelected && <Clock size={11} aria-hidden="true" className={styles.ticketIcon} />}
                  {isSold && !isSelected && <Lock size={11} aria-hidden="true" className={styles.ticketIcon} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Sin resultados */}
        {filteredTickets.length === 0 && !isLoading && (
          <div className={styles.emptyResults}>
            <p>No se encontraron boletos que coincidan con el filtro seleccionado.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
              }}
            >
              Restablecer filtros
            </Button>
          </div>
        )}

        {/* Leyenda Visual de Estados */}
        <div className={styles.legendContainer} aria-label="Leyenda de estados de boletos">
          <div className={styles.legendItem}>
            <div className={`${styles.legendBox} ${styles.ticketAvailable}`} aria-hidden="true">
              <span>042</span>
            </div>
            <span className={styles.legendText}>Disponible</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendBox} ${styles.ticketSelected}`} aria-hidden="true">
              <span>042</span>
              <CheckCircle size={10} aria-hidden="true" className={styles.legendIcon} />
            </div>
            <span className={styles.legendText}>Seleccionado</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendBox} ${styles.ticketReserved}`} aria-hidden="true">
              <span>042</span>
              <Clock size={10} aria-hidden="true" className={styles.legendIcon} />
            </div>
            <span className={styles.legendText}>En reserva</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendBox} ${styles.ticketSold}`} aria-hidden="true">
              <span>042</span>
              <Lock size={10} aria-hidden="true" className={styles.legendIcon} />
            </div>
            <span className={styles.legendText}>Vendido</span>
          </div>
        </div>
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
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </section>
  );
};
