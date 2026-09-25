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
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { formatCOP, formatTicketNumber } from '@/lib/utils';
import { SectionHeader, Button } from '@/components/public/ui';
import { GanadorShowcase } from './GanadorShowcase';
import styles from './SelectorBoletos.module.css';

type FilterType = 'all' | 'available' | 'selected';

// Rangos de 200 boletos para pantallas de escritorio (≥ 1024px)
export const DESKTOP_RANGES = [
  { label: '000 - 199', min: 0, max: 199 },
  { label: '200 - 399', min: 200, max: 399 },
  { label: '400 - 599', min: 400, max: 599 },
  { label: '600 - 799', min: 600, max: 799 },
  { label: '800 - 999', min: 800, max: 999 },
];

// Alias para compatibilidad absoluta con referencias residuales o HMR
export const RANGES = DESKTOP_RANGES;

// Rangos de 100 boletos para teléfonos, tablets y dispositivos pequeños (< 1024px)
const COMPACT_RANGES = [
  { label: '000 - 099', min: 0, max: 99 },
  { label: '100 - 199', min: 100, max: 199 },
  { label: '200 - 299', min: 200, max: 299 },
  { label: '300 - 399', min: 300, max: 399 },
  { label: '400 - 499', min: 400, max: 499 },
  { label: '500 - 599', min: 500, max: 599 },
  { label: '600 - 699', min: 600, max: 699 },
  { label: '700 - 799', min: 700, max: 799 },
  { label: '800 - 899', min: 800, max: 899 },
  { label: '900 - 999', min: 900, max: 999 },
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
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);

  // Detección reactiva de vista compacta para móviles y tablets (< 1024px)
  const [isCompactView, setIsCompactView] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(max-width: 1023px)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 1023px)');
    setIsCompactView(mql.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setIsCompactView(e.matches);
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
    } else {
      mql.addListener(onChange);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', onChange);
      } else {
        mql.removeListener(onChange);
      }
    };
  }, []);

  const [selectedDesktopIndex, setSelectedDesktopIndex] = useState<number>(0);
  const [selectedCompactIndex, setSelectedCompactIndex] = useState<number>(0);

  const handleDesktopRangeSelect = (idx: number) => {
    setSelectedDesktopIndex(idx);
    setSelectedCompactIndex(Math.min(idx * 2, COMPACT_RANGES.length - 1));
  };

  const handleCompactRangeSelect = (idx: number) => {
    setSelectedCompactIndex(idx);
    setSelectedDesktopIndex(Math.min(Math.floor(idx / 2), DESKTOP_RANGES.length - 1));
  };

  const handlePrevRange = () => {
    if (selectedCompactIndex > 0) {
      handleCompactRangeSelect(selectedCompactIndex - 1);
    }
  };

  const handleNextRange = () => {
    if (selectedCompactIndex < COMPACT_RANGES.length - 1) {
      handleCompactRangeSelect(selectedCompactIndex + 1);
    }
  };

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

  // Boletos filtrados: en móviles y tablets muestra estrictamente 100 boletos por grupo; en escritorio 200 boletos
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
      return list;
    }

    // Filtro por rango numérico: en móvil y tablet son 100 boletos, en escritorio son 200 boletos
    const curRange = isCompactView
      ? COMPACT_RANGES[selectedCompactIndex]
      : DESKTOP_RANGES[selectedDesktopIndex];

    if (curRange) {
      list = list.filter((t) => {
        const num = parseInt(t.number, 10);
        return num >= curRange.min && num <= curRange.max;
      });
    }

    return list;
  }, [
    tickets,
    searchTerm,
    filterType,
    isCompactView,
    selectedCompactIndex,
    selectedDesktopIndex,
    selectedTickets,
  ]);

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
              Toca o selecciona los números que deseas comprar o usa la selección al azar. Valor
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

        {/* Filtros de Rango y Disponibilidad */}
        {!searchTerm && (
          <div className={styles.filterBar}>
            {/* 1. Selector de Rangos de 200 Boletos (Exclusivo Escritorio ≥ 1024px) */}
            <div
              className={styles.desktopRangeChips}
              role="toolbar"
              aria-label="Filtrar por rango de boletos"
            >
              {DESKTOP_RANGES.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.filterChip} ${selectedDesktopIndex === idx ? styles.filterChipActive : ''}`}
                  onClick={() => handleDesktopRangeSelect(idx)}
                  aria-pressed={selectedDesktopIndex === idx}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* 2. Navegador de Rangos de 100 Boletos (Exclusivo Móviles y Tablets < 1024px) */}
            <div
              className={styles.compactRangeNavigator}
              role="region"
              aria-label="Navegador de rangos de 100 boletos"
            >
              <button
                type="button"
                className={styles.rangeNavArrow}
                onClick={handlePrevRange}
                disabled={selectedCompactIndex === 0}
                aria-label="Ver 100 boletos anteriores"
                title="Ver 100 boletos anteriores"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>

              <div className={styles.rangeSelectorCard}>
                <div className={styles.rangeSelectorInfo}>
                  <div className={styles.rangeMainLabelRow}>
                    <Layers size={14} className={styles.rangeIcon} aria-hidden="true" />
                    <span className={styles.rangeMainLabel}>
                      Boletos {COMPACT_RANGES[selectedCompactIndex]?.label}
                    </span>
                    <ChevronDown size={14} className={styles.rangeChevronIcon} aria-hidden="true" />
                  </div>
                  <span className={styles.rangeMetaBadge}>
                    Grupo {selectedCompactIndex + 1} de {COMPACT_RANGES.length} • 100 boletos
                  </span>
                </div>

                {/* Select nativo overlay para interacción táctil fluida sin desbordamiento */}
                <select
                  className={styles.rangeNativeSelect}
                  value={selectedCompactIndex}
                  onChange={(e) => handleCompactRangeSelect(Number(e.target.value))}
                  aria-label="Elegir grupo de 100 boletos"
                >
                  {COMPACT_RANGES.map((r, idx) => (
                    <option key={r.label} value={idx}>
                      Boletos {r.label} ({idx + 1} de {COMPACT_RANGES.length} • 100 boletos)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className={styles.rangeNavArrow}
                onClick={handleNextRange}
                disabled={selectedCompactIndex === COMPACT_RANGES.length - 1}
                aria-label="Ver 100 boletos siguientes"
                title="Ver 100 boletos siguientes"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>

            {/* 3. Filtros de Disponibilidad (Todos, Solo Libres, Mis Boletos) */}
            <div className={styles.statusChips} role="toolbar" aria-label="Filtrar por disponibilidad">
              <button
                type="button"
                className={`${styles.filterChip} ${styles.statusChip} ${filterType === 'all' ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType('all')}
                aria-pressed={filterType === 'all'}
              >
                Todos
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${styles.statusChip} ${filterType === 'available' ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType('available')}
                aria-pressed={filterType === 'available'}
              >
                Solo Libres
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${styles.statusChip} ${filterType === 'selected' ? styles.filterChipActive : ''}`}
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
                setSelectedDesktopIndex(0);
                setSelectedCompactIndex(0);
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
