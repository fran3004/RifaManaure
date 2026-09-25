import { formatTicketNumber } from './utils';

export interface TicketRange {
  min: number;
  max: number;
  label: string;
  count: number;
}

export type TicketRangeStrategy = 'desktop' | 'compact' | 'auto';

export interface GenerateTicketRangesOptions {
  strategy?: TicketRangeStrategy;
  chunkSize?: number;
  digits?: number;
}

/**
 * Calcula dinámicamente la cantidad de cifras de presentación según la emisión total:
 * - totalTickets <= 100 => 2 cifras (00 a 99)
 * - totalTickets <= 1000 => 3 cifras (000 a 999)
 * - totalTickets <= 10000 => 4 cifras (0000 a 9999)
 * - para cantidades superiores, calcula los dígitos necesarios dinámicamente.
 *
 * La numeración representa siempre desde 0 hasta totalTickets - 1.
 */
export function getTicketDigits(totalTickets: number): number {
  if (totalTickets <= 0) return 2;
  if (totalTickets <= 100) return 2;
  if (totalTickets <= 1000) return 3;
  if (totalTickets <= 10000) return 4;
  return String(Math.max(totalTickets - 1, 0)).length;
}

/**
 * Determina el tamaño de lote (chunk size) adecuado según la emisión y la estrategia:
 * - desktop: busca entre 4 y 10 grupos cuando la emisión lo justifique.
 * - compact: selector ágil para móvil y tablet sin desbordar con decenas de opciones.
 */
export function resolveChunkSize(
  totalTickets: number,
  strategyOrChunkSize: TicketRangeStrategy | number | GenerateTicketRangesOptions = 'desktop'
): number {
  if (typeof strategyOrChunkSize === 'number') {
    return Math.max(1, strategyOrChunkSize);
  }

  const options: GenerateTicketRangesOptions =
    typeof strategyOrChunkSize === 'string'
      ? { strategy: strategyOrChunkSize }
      : strategyOrChunkSize || {};

  if (options.chunkSize && options.chunkSize > 0) {
    return options.chunkSize;
  }

  const strategy = options.strategy || 'desktop';

  if (totalTickets <= 100) {
    return 100;
  }

  if (strategy === 'compact') {
    if (totalTickets <= 1000) return 100;
    if (totalTickets <= 2000) return 200;
    if (totalTickets <= 10000) return 1000;
  } else {
    // desktop o auto
    if (totalTickets <= 500) return 100;
    if (totalTickets <= 2000) return 200;
    if (totalTickets <= 10000) return 1000;
  }

  // Emisiones superiores a 10.000: mantener entre 4 y 10 grupos legibles
  const rawChunk = Math.ceil(totalTickets / 10);
  const power = Math.pow(10, Math.floor(Math.log10(rawChunk)));
  const normalized = rawChunk / power;

  let roundedFactor: number;
  if (normalized <= 1) roundedFactor = 1;
  else if (normalized <= 2) roundedFactor = 2;
  else if (normalized <= 2.5) roundedFactor = 2.5;
  else if (normalized <= 5) roundedFactor = 5;
  else roundedFactor = 10;

  return Math.max(1000, Math.round(roundedFactor * power));
}

/**
 * Genera rangos de boletos puros y continuos que cubren el 100% de la emisión:
 * - 0 hasta totalTickets - 1
 * - Cero solapamientos, cero huecos y cero rangos vacíos
 * - Etiquetas formateadas de manera homogénea con ceros a la izquierda
 */
export function generateTicketRanges(
  totalTickets: number,
  strategyOrChunkSize: TicketRangeStrategy | number | GenerateTicketRangesOptions = 'desktop',
  presentationDigits?: number
): TicketRange[] {
  if (!totalTickets || totalTickets <= 0) {
    return [];
  }

  const digits = presentationDigits ?? getTicketDigits(totalTickets);
  const chunkSize = resolveChunkSize(totalTickets, strategyOrChunkSize);

  const ranges: TicketRange[] = [];
  let currentMin = 0;

  while (currentMin < totalTickets) {
    const currentMax = Math.min(currentMin + chunkSize - 1, totalTickets - 1);
    const startStr = formatTicketNumber(currentMin, digits);
    const endStr = formatTicketNumber(currentMax, digits);
    const count = currentMax - currentMin + 1;

    ranges.push({
      min: currentMin,
      max: currentMax,
      label: `${startStr} - ${endStr}`,
      count,
    });

    currentMin = currentMax + 1;
  }

  return ranges;
}

/**
 * Encuentra el índice del rango que contiene un número de boleto específico.
 */
export function findMatchingRangeIndex(ranges: TicketRange[], ticketNumber: number): number {
  if (!ranges || ranges.length === 0) return 0;
  const idx = ranges.findIndex((r) => ticketNumber >= r.min && ticketNumber <= r.max);
  return idx !== -1 ? idx : 0;
}
