import { useState, useEffect, useMemo, useCallback } from 'react';
import type { RaffleRow } from '@/types/raffle.types';
import { getActiveRaffle } from '@/services/ticketService';
import { useOptionalTicketCart } from '@/context/useTicketCart';
import { formatTicketNumber } from '@/lib/utils';

export const RAFFLE_CACHE_KEY = 'manaure_active_raffle_cache';
export const RAFFLE_UPDATED_EVENT = 'manaure_raffle_updated';

/**
 * Listado oficial de principales loterías y sorteos en Colombia.
 * Facilita el autocompletado y selección intuitiva en el panel administrativo.
 */
export const COLOMBIAN_LOTTERIES = [
  'Lotería del Sinuano',
  'El Sinuano Noche',
  'El Sinuano Día',
  'Lotería de Santander',
  'Lotería de Boyacá',
  'Lotería de Medellín',
  'Lotería del Valle',
  'Lotería de Bogotá',
  'Lotería de la Cruz Roja',
  'Lotería del Huila',
  'Lotería del Cauca',
  'Lotería de Cundinamarca',
  'Lotería del Quindío',
  'Lotería del Meta',
  'Lotería de Manizales',
  'Lotería de Risaralda',
  'Caribeña Noche',
  'Caribeña Día',
  'Chontico Noche',
  'Chontico Día',
  'Motilón Noche',
  'Motilón Día',
  'Paisita Noche',
  'Paisita Día',
  'Culona Noche',
  'Culona Día',
] as const;

export function getStoredCachedRaffle(): RaffleRow | null {
  try {
    if (typeof window !== 'undefined') {
      const item = localStorage.getItem(RAFFLE_CACHE_KEY);
      if (item) return JSON.parse(item);
    }
  } catch {
    // Ignorar excepciones de parseo o almacenamiento
  }
  return null;
}

export function saveCachedRaffle(raffle: RaffleRow): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(RAFFLE_CACHE_KEY, JSON.stringify(raffle));
      window.dispatchEvent(
        new CustomEvent(RAFFLE_UPDATED_EVENT, { detail: raffle })
      );
    }
  } catch {
    // Ignorar excepciones de almacenamiento
  }
}

export function formatDrawDate(dateString?: string | null): string {
  if (!dateString) return 'Fecha por definir';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const formatted = new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    }).format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateString;
  }
}

/**
 * Reemplaza de forma dinámica cualquier referencia a loterías en respuestas o textos de la web.
 */
export function formatFaqAnswer(
  answer: string,
  context: { lotteryReference?: string; cifrasText?: string }
): string {
  if (!context.lotteryReference && !context.cifrasText) return answer;

  let formatted = answer;

  if (context.lotteryReference) {
    formatted = formatted.replace(
      /Loter[íi]a(?: Oficial)? de Santander/gi,
      context.lotteryReference
    );
  }

  if (context.cifrasText) {
    formatted = formatted.replace(
      /3\s*[úu]ltimas\s*cifras/gi,
      context.cifrasText
    );
  }

  return formatted;
}

export interface UseActiveRaffleResult {
  raffle: RaffleRow | null;
  lotteryReference: string;
  totalTickets: number;
  ticketDigits: number;
  ticketRange: string;
  cifrasText: string;
  drawDateFormatted: string;
  ticketPrice: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado que suministra los datos reactivos de la rifa activa
 * y su lotería de referencia en todas las vistas públicas y administrativas.
 */
export function useActiveRaffle(): UseActiveRaffleResult {
  const cartContext = useOptionalTicketCart();
  const [localRaffle, setLocalRaffle] = useState<RaffleRow | null>(() => getStoredCachedRaffle());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const activeRaffle = cartContext?.raffle ?? localRaffle;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await getActiveRaffle();
      if (fetched) {
        setLocalRaffle(fetched);
        saveCachedRaffle(fetched);
      }
    } catch (err) {
      console.error('Error al sincronizar rifa activa:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sincronizar en montaje si no hay datos o fuera de TicketCartProvider
  useEffect(() => {
    if (!cartContext?.raffle && !localRaffle) {
      void refresh();
    }
  }, [cartContext?.raffle, localRaffle, refresh]);

  // Escuchar eventos globales de actualización para sincronización instantánea entre módulos
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRaffleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<RaffleRow>;
      if (customEvent.detail) {
        setLocalRaffle(customEvent.detail);
      } else {
        void refresh();
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === RAFFLE_CACHE_KEY && e.newValue) {
        try {
          setLocalRaffle(JSON.parse(e.newValue));
        } catch {}
      }
    };

    window.addEventListener(RAFFLE_UPDATED_EVENT, handleRaffleUpdate);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(RAFFLE_UPDATED_EVENT, handleRaffleUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refresh]);

  const totalTickets = activeRaffle?.total_tickets || 1000;

  const ticketDigits = useMemo(() => {
    if (totalTickets <= 100) return 2;
    if (totalTickets <= 1000) return 3;
    if (totalTickets <= 10000) return 4;
    return String(Math.max(totalTickets - 1, 0)).length;
  }, [totalTickets]);

  const ticketRange = useMemo(() => {
    const start = formatTicketNumber(0, ticketDigits);
    const end = formatTicketNumber(Math.max(totalTickets - 1, 0), ticketDigits);
    return `${start} al ${end}`;
  }, [totalTickets, ticketDigits]);

  const cifrasText = useMemo(() => {
    if (ticketDigits === 2) return 'dos (2) cifras';
    if (ticketDigits === 3) return 'tres (3) últimas cifras';
    if (ticketDigits === 4) return 'cuatro (4) últimas cifras';
    return `${ticketDigits} cifras`;
  }, [ticketDigits]);

  const lotteryReference = useMemo(() => {
    return activeRaffle?.lottery_reference?.trim() || 'Lotería Oficial';
  }, [activeRaffle?.lottery_reference]);

  const drawDateFormatted = useMemo(() => {
    return formatDrawDate(activeRaffle?.draw_date);
  }, [activeRaffle?.draw_date]);

  const ticketPrice = useMemo(() => {
    return activeRaffle?.ticket_price ? Number(activeRaffle.ticket_price) : 0;
  }, [activeRaffle?.ticket_price]);

  return {
    raffle: activeRaffle,
    lotteryReference,
    totalTickets,
    ticketDigits,
    ticketRange,
    cifrasText,
    drawDateFormatted,
    ticketPrice,
    isLoading,
    refresh,
  };
}
