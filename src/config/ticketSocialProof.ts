/**
 * Configuración y umbrales de prueba social y progreso de boletos
 * Define los límites de honestidad comercial y valores por defecto.
 */
export const TICKET_STATS_CONFIG = {
  /** Porcentaje mínimo de venta para mostrar la barra de progreso (5 %) */
  EARLY_STAGE_THRESHOLD_PERCENT: 5,

  /** Porcentaje de ocupación (vendidos + reservados) para alertar de boletos casi agotados (90 %) */
  ALMOST_SOLD_OUT_THRESHOLD_PERCENT: 90,

  /** Total de boletos por defecto en el sistema para sorteo de 3 cifras (000-999) */
  DEFAULT_TOTAL_TICKETS: 1000,
} as const;

export interface TicketStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  percentageSold: number;
  percentageReserved: number;
  percentageTaken: number;
  isEarlyStage: boolean;
  isAlmostSoldOut: boolean;
}

/**
 * Calcula de forma determinista y pura las estadísticas de boletos
 */
export function calculateTicketStats(tickets: Array<{ status: string }>): TicketStats {
  const total = tickets.length || TICKET_STATS_CONFIG.DEFAULT_TOTAL_TICKETS;
  let available = 0;
  let reserved = 0;
  let sold = 0;

  for (let i = 0; i < tickets.length; i++) {
    const status = tickets[i].status;
    if (status === 'available') available++;
    else if (status === 'reserved') reserved++;
    else if (status === 'sold') sold++;
  }

  const percentageSold = total > 0 ? (sold / total) * 100 : 0;
  const percentageReserved = total > 0 ? (reserved / total) * 100 : 0;
  const percentageTaken = percentageSold + percentageReserved;

  return {
    total,
    available,
    reserved,
    sold,
    percentageSold,
    percentageReserved,
    percentageTaken,
    isEarlyStage: percentageSold < TICKET_STATS_CONFIG.EARLY_STAGE_THRESHOLD_PERCENT,
    isAlmostSoldOut: percentageTaken >= TICKET_STATS_CONFIG.ALMOST_SOLD_OUT_THRESHOLD_PERCENT,
  };
}

/**
 * Formatea cifras al estándar colombiano (ej: 1.000)
 */
export function formatTicketCount(count: number): string {
  return new Intl.NumberFormat('es-CO').format(count);
}
