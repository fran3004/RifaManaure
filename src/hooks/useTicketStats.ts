import { useTicketCart } from '@/context/useTicketCart';
import type { TicketStats } from '@/config/ticketSocialProof';

export interface UseTicketStatsReturn extends TicketStats {
  isLoading: boolean;
  hasLoaded: boolean;
  hasError: boolean;
}

/**
 * Hook para consumir estadísticas de boletos y prueba social
 * garantizando una ÚNICA consulta y una ÚNICA suscripción Realtime a través del TicketCartContext.
 */
export function useTicketStats(): UseTicketStatsReturn {
  const { ticketStats, isLoading, tickets } = useTicketCart();
  const hasLoaded = !isLoading && tickets.length > 0;
  const hasError = !isLoading && tickets.length === 0;

  return {
    ...ticketStats,
    isLoading,
    hasLoaded,
    hasError,
  };
}

