import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  X,
  ChevronDown,
  ChevronUp,
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
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);

  const cartRef = useRef<HTMLElement>(null);

  // Coordinación dinámica de la variable CSS --cart-h con soporte inmediato para rotación de pantalla
  useEffect(() => {
    if (selectedTickets.length === 0) {
      document.documentElement.style.setProperty('--cart-h', '0px');
      setIsMobileListOpen(false);
      return;
    }

    const updateCartHeight = () => {
      if (cartRef.current) {
        const rect = cartRef.current.getBoundingClientRect();
        const height = Math.round(rect.height || cartRef.current.offsetHeight);
        // Se agregan 16px para el margen flotante sobre la parte inferior
        document.documentElement.style.setProperty('--cart-h', `${height + 16}px`);
      }
    };

    updateCartHeight();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && cartRef.current) {
      observer = new ResizeObserver(() => {
        updateCartHeight();
      });
      observer.observe(cartRef.current);
    }

    const handleRotationOrResize = () => {
      updateCartHeight();
      // Doble requestAnimationFrame para sincronizar cuando el navegador calcule las dimensiones tras rotación
      requestAnimationFrame(() => {
        updateCartHeight();
        requestAnimationFrame(updateCartHeight);
      });
    };

    window.addEventListener('resize', handleRotationOrResize, { passive: true });
    window.addEventListener('orientationchange', handleRotationOrResize, { passive: true });

    let orientationMedia: MediaQueryList | null = null;
    const handleMediaChange = () => handleRotationOrResize();
    if (typeof window !== 'undefined' && window.matchMedia) {
      orientationMedia = window.matchMedia('(orientation: portrait)');
      if (orientationMedia.addEventListener) {
        orientationMedia.addEventListener('change', handleMediaChange);
      }
    }

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', handleRotationOrResize);
      window.removeEventListener('orientationchange', handleRotationOrResize);
      if (orientationMedia && orientationMedia.removeEventListener) {
        orientationMedia.removeEventListener('change', handleMediaChange);
      }
      document.documentElement.style.setProperty('--cart-h', '0px');
    };
  }, [selectedTickets.length, isMobileListOpen]);

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

          {/* Botones de Azar y Limpieza con Estructura Estable Anti-CLS (MED-01) */}
          <div className={styles.randomButtons}>
            <div className={styles.randomHeaderRow}>
              <div className={styles.randomLabel}>
                <Sparkles size={16} aria-hidden="true" />
                <span>Azar:</span>
              </div>
              <div className={styles.clearSlot}>
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
            <p>Sincronizando boletos en tiempo real...</p>
          </div>
        ) : (
          <div className={styles.ticketGrid}>
            {filteredTickets.map((ticket) => {
              const isSelected = selectedTickets.includes(ticket.number);
              const isAvailable = ticket.status === 'available';
              const isReserved = ticket.status === 'reserved';
              const isSold = ticket.status === 'sold' || ticket.status === 'paid' || (ticket.status as string) === 'vendido';

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
        <aside
          ref={cartRef}
          className={styles.floatingCart}
          aria-label="Resumen de boletos seleccionados y compra"
        >
          {/* Panel desplegable de boletos para móvil */}
          {isMobileListOpen && (
            <div id="mobile-cart-tickets" className={styles.mobilePanel}>
              <div className={styles.mobilePanelHeader}>
                <span className={styles.mobilePanelTitle}>
                  Boletos seleccionados ({selectedTickets.length}
                  {maxTicketsPerBuyer ? `/${maxTicketsPerBuyer}` : ''}):
                </span>
                <button
                  type="button"
                  className={styles.closePanelBtn}
                  onClick={() => setIsMobileListOpen(false)}
                  aria-label="Cerrar lista de boletos"
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.mobileChipsGrid}>
                {selectedTickets.map((num) => (
                  <span key={num} className={styles.ticketChip}>
                    <span className={styles.ticketChipNum}>{num}</span>
                    <button
                      type="button"
                      className={styles.removeTicketBtn}
                      onClick={() => toggleTicketSelection(num)}
                      aria-label={`Quitar boleto ${num}`}
                      title={`Quitar boleto ${num}`}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.cartContainer}>
            {/* Resumen a la izquierda */}
            <div className={styles.cartSummary} aria-live="polite" aria-atomic="true">
              <div className={styles.cartCountRow}>
                <span className={styles.cartCountBadge}>
                  {selectedTickets.length} {selectedTickets.length === 1 ? 'Boleto' : 'Boletos'}
                </span>
                {isMaxLimitReached && (
                  <span className={styles.limitReachedBadge}>
                    Límite ({maxTicketsPerBuyer})
                  </span>
                )}
                {/* Botón de alternar lista de boletos en móvil */}
                <button
                  type="button"
                  className={styles.mobileToggleBtn}
                  onClick={() => setIsMobileListOpen((prev) => !prev)}
                  aria-expanded={isMobileListOpen}
                  aria-controls="mobile-cart-tickets"
                  aria-label={
                    isMobileListOpen
                      ? 'Ocultar boletos seleccionados'
                      : `Ver ${selectedTickets.length} boletos seleccionados`
                  }
                >
                  <span>{isMobileListOpen ? 'Ocultar' : `Ver (${selectedTickets.length})`}</span>
                  {isMobileListOpen ? (
                    <ChevronDown size={14} aria-hidden="true" />
                  ) : (
                    <ChevronUp size={14} aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className={styles.cartTotalBox}>
                <span className={styles.cartTotalLabel}>Total:</span>
                <strong className={styles.cartTotalValue}>{formatCOP(totalAmount)}</strong>
              </div>
            </div>

            {/* Chips en el centro con scroll horizontal y máscara (Escritorio ≥ 768px) */}
            <div
              className={styles.cartNumbersList}
              role="region"
              aria-label="Lista de boletos seleccionados"
            >
              {selectedTickets.map((num) => (
                <span key={num} className={styles.ticketChip}>
                  <span className={styles.ticketChipNum}>{num}</span>
                  <button
                    type="button"
                    className={styles.removeTicketBtn}
                    onClick={() => toggleTicketSelection(num)}
                    aria-label={`Quitar boleto ${num}`}
                    title={`Quitar boleto ${num}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>

            {/* CTA a la derecha */}
            <div className={styles.cartActions}>
              <Button
                type="button"
                variant="accent"
                size="md"
                className={styles.checkoutBtn}
                onClick={openCheckout}
                rightIcon={<ArrowRight size={18} aria-hidden="true" />}
              >
                Comprar Ahora
              </Button>
            </div>
          </div>
        </aside>
      )}
    </section>
  );
};
