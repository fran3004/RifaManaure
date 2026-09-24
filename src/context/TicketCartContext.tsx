import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { TicketRow, RaffleRow, WinnerWithDetails } from '@/types/raffle.types';
import { getActiveRaffle, getTickets } from '@/services/ticketService';
import { getWinnerForRaffle } from '@/services/winnerService';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { supabase } from '@/lib/supabase';
import { getRandomTicketNumbers } from '@/lib/utils';
import { calculateTicketStats } from '@/config/ticketSocialProof';
import { TicketCartContext } from './TicketCartContextDefinition';
import { ToastNotification, type ToastItem } from '@/components/common/ToastNotification';

const RAFFLE_CACHE_KEY = 'manaure_active_raffle_cache';
const WINNER_CACHE_KEY = 'manaure_active_winner_cache';

function getCachedRaffle(): RaffleRow | null {
  try {
    if (typeof window !== 'undefined') {
      const item = localStorage.getItem(RAFFLE_CACHE_KEY);
      if (item) return JSON.parse(item);
    }
  } catch {
    // Ignorar errores de parseo o almacenamiento
  }
  return null;
}

function getCachedWinner(): WinnerWithDetails | null {
  try {
    if (typeof window !== 'undefined') {
      const item = localStorage.getItem(WINNER_CACHE_KEY);
      if (item) return JSON.parse(item);
    }
  } catch {
    // Ignorar errores de parseo o almacenamiento
  }
  return null;
}

export const TicketCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemSettings = useSystemSettings();
  const cachedRaffle = getCachedRaffle();
  const [raffle, setRaffle] = useState<RaffleRow | null>(cachedRaffle);
  const [winner, setWinner] = useState<WinnerWithDetails | null>(getCachedWinner);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedRaffle);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastItem | null>(null);

  const maxTicketsPerBuyer =
    systemSettings?.max_tickets_per_buyer ?? raffle?.max_tickets_per_buyer ?? 20;
  const unitPrice = raffle?.ticket_price ? Number(raffle.ticket_price) : 0;
  const totalAmount = selectedTickets.length * unitPrice;

  // Estadísticas unificadas y reactivas en tiempo real derivadas del listado de boletos
  const ticketStats = useMemo(() => {
    return calculateTicketStats(tickets);
  }, [tickets]);

  const showToast = useCallback(
    (
      type: 'warning' | 'info' | 'error' | 'success',
      title: string,
      message: string,
      duration = 4500
    ) => {
      setToast({
        id: Date.now().toString(),
        type,
        title,
        message,
        duration,
      });
    },
    []
  );

  // Carga y sincronización de rifa, boletos y ganador si la rifa ya concluyó
  const loadData = useCallback(async () => {
    try {
      const currentRaffle = await getActiveRaffle();

      if (currentRaffle) {
        setRaffle(currentRaffle);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(RAFFLE_CACHE_KEY, JSON.stringify(currentRaffle));
          }
        } catch {}

        // Consultar si esta edición de la rifa ya tiene ganador oficial registrado
        const raffleWinner = await getWinnerForRaffle(currentRaffle.id);
        if (raffleWinner && currentRaffle.status === 'finished') {
          setWinner(raffleWinner);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(WINNER_CACHE_KEY, JSON.stringify(raffleWinner));
            }
          } catch {}
          setTickets([]);
          setSelectedTickets([]);
        } else {
          setWinner(null);
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(WINNER_CACHE_KEY);
            }
          } catch {}
          const ticketList = await getTickets(currentRaffle.id);
          setTickets(ticketList);
        }
      } else {
        setRaffle(null);
        setWinner(null);
        try {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(RAFFLE_CACHE_KEY);
            localStorage.removeItem(WINNER_CACHE_KEY);
          }
        } catch {}
        setTickets([]);
      }
    } catch (err) {
      console.error('Error al sincronizar datos de la rifa/ganador:', err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const currentRaffle = await getActiveRaffle();
        if (ignore) return;

        if (currentRaffle) {
          setRaffle(currentRaffle);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(RAFFLE_CACHE_KEY, JSON.stringify(currentRaffle));
            }
          } catch {}

          const raffleWinner = await getWinnerForRaffle(currentRaffle.id);
          if (ignore) return;
          if (raffleWinner && currentRaffle.status === 'finished') {
            setWinner(raffleWinner);
            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem(WINNER_CACHE_KEY, JSON.stringify(raffleWinner));
              }
            } catch {}
            setTickets([]);
            setSelectedTickets([]);
          } else {
            setWinner(null);
            try {
              if (typeof window !== 'undefined') {
                localStorage.removeItem(WINNER_CACHE_KEY);
              }
            } catch {}
            const ticketList = await getTickets(currentRaffle.id);
            if (ignore) return;
            setTickets(ticketList);
          }
        } else {
          setRaffle(null);
          setWinner(null);
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(RAFFLE_CACHE_KEY);
              localStorage.removeItem(WINNER_CACHE_KEY);
            }
          } catch {}
          setTickets([]);
        }
      } catch (err) {
        console.error('Error al inicializar datos:', err);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  // Suscripción en Tiempo Real con Supabase Realtime (Rifas y Ganadores)
  useEffect(() => {
    // 1. Suscripción a cambios de la rifa (nueva rifa activa, pausada, o finalizada)
    const raffleChannel = supabase
      .channel('raffles_realtime_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'raffles',
        },
        async () => {
          await loadData();
        }
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal raffles_realtime_channel:', err?.message || status);
        }
      });

    // 2. Suscripción inmediata al registro oficial de ganadores
    const winnersChannel = supabase
      .channel('winners_realtime_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'winners',
        },
        async () => {
          await loadData();
        }
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Canal winners_realtime_channel:', err?.message || status);
        }
      });

    return () => {
      void supabase.removeChannel(raffleChannel);
      void supabase.removeChannel(winnersChannel);
    };
  }, [loadData]);

  useEffect(() => {
    if (!raffle?.id) return;

    const channel = supabase
      .channel(`tickets_realtime_${raffle.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `raffle_id=eq.${raffle.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as TicketRow;
            setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));

            // Si un boleto que el usuario tenía seleccionado pasó a reservado o vendido por otro comprador, deseleccionarlo
            if (updated.status !== 'available') {
              setSelectedTickets((prev) => prev.filter((num) => num !== updated.number));
            }
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as TicketRow;
            setTickets((prev) =>
              [...prev, inserted].sort((a, b) => a.number.localeCompare(b.number))
            );
          } else if (payload.eventType === 'DELETE') {
            const oldTicket = payload.old as Partial<TicketRow>;
            if (oldTicket?.id) {
              setTickets((prev) => prev.filter((t) => t.id !== oldTicket.id));
              if (oldTicket.number) {
                setSelectedTickets((prev) => prev.filter((num) => num !== oldTicket.number));
              }
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (err || status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Canal tickets_realtime_${raffle.id}:`, err?.message || status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [raffle?.id]);

  const toggleTicketSelection = (ticketNumber: string) => {
    if (raffle && raffle.status !== 'active') {
      showToast(
        'info',
        'Sorteo Pausado',
        'La venta de boletos no está disponible en este momento.'
      );
      return;
    }
    const targetTicket = tickets.find((t) => t.number === ticketNumber);
    if (!targetTicket || targetTicket.status !== 'available') return;

    setSelectedTickets((prev) => {
      if (prev.includes(ticketNumber)) {
        return prev.filter((num) => num !== ticketNumber);
      }
      if (prev.length >= maxTicketsPerBuyer) {
        showToast(
          'warning',
          '¡Límite de Boletos Alcanzado!',
          `Has alcanzado el límite máximo de ${maxTicketsPerBuyer} boletos por comprador. Puedes continuar al checkout o retirar un número seleccionado.`
        );
        return prev;
      }
      return [...prev, ticketNumber];
    });
  };

  const selectRandomTickets = (count: number) => {
    if (raffle && raffle.status !== 'active') {
      showToast(
        'info',
        'Sorteo Pausado',
        'La venta de boletos no está disponible en este momento.'
      );
      return;
    }
    const availableNumbers = tickets
      .filter((t) => t.status === 'available' && !selectedTickets.includes(t.number))
      .map((t) => t.number);

    if (availableNumbers.length === 0) {
      showToast(
        'info',
        'Boletos Agotados',
        'No hay más boletos disponibles para selección aleatoria.'
      );
      return;
    }

    const availableToPick = Math.min(count, maxTicketsPerBuyer - selectedTickets.length);
    if (availableToPick <= 0) {
      showToast(
        'warning',
        '¡Límite de Boletos Alcanzado!',
        `Ya tienes ${selectedTickets.length} de un máximo permitido de ${maxTicketsPerBuyer} boletos.`
      );
      return;
    }

    const randomPicks = getRandomTicketNumbers(availableNumbers, availableToPick);
    setSelectedTickets((prev) => [...prev, ...randomPicks]);

    if (availableToPick < count) {
      showToast(
        'warning',
        'Selección Parcial por Límite',
        `Solo se añadieron ${availableToPick} boletos para respetar el tope de ${maxTicketsPerBuyer} boletos por orden.`
      );
    }
  };

  const clearSelection = () => {
    setSelectedTickets([]);
  };

  const openCheckout = () => {
    if (raffle && raffle.status !== 'active') {
      showToast(
        'info',
        'Sorteo Pausado',
        'La rifa se encuentra pausada o no está disponible para compras en este momento.'
      );
      return;
    }
    if (selectedTickets.length === 0) {
      showToast(
        'warning',
        'Selección Requerida',
        'Por favor selecciona al menos un boleto para continuar con la compra.'
      );
      return;
    }
    setIsCheckoutOpen(true);
  };

  const closeCheckout = () => {
    setIsCheckoutOpen(false);
  };

  return (
    <TicketCartContext.Provider
      value={{
        raffle,
        winner,
        systemSettings,
        tickets,
        ticketStats,
        selectedTickets,
        isLoading,
        unitPrice,
        totalAmount,
        maxTicketsPerBuyer,
        toggleTicketSelection,
        selectRandomTickets,
        clearSelection,
        refreshTickets: loadData,
        isCheckoutOpen,
        openCheckout,
        closeCheckout,
        showToast,
      }}
    >
      {children}
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </TicketCartContext.Provider>
  );
};
