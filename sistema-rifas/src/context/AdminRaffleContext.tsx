import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAdminRaffles, type RaffleWithStats } from '@/services/raffleService';

export interface AdminRaffleContextValue {
  selectedRaffleId: string | null;
  selectedRaffle: RaffleWithStats | null;
  raffles: RaffleWithStats[];
  isLoadingRaffles: boolean;
  setSelectedRaffleId: (id: string) => void;
  reloadRaffles: () => Promise<void>;
}

const AdminRaffleContext = createContext<AdminRaffleContextValue | undefined>(undefined);

const STORAGE_KEY = 'admin_selected_raffle_id';

export const AdminRaffleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [raffles, setRaffles] = useState<RaffleWithStats[]>([]);
  const [selectedRaffleId, setSelectedRaffleIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [isLoadingRaffles, setIsLoadingRaffles] = useState<boolean>(true);

  const reloadRaffles = useCallback(async () => {
    try {
      const res = await fetchAdminRaffles();
      if (res.success && res.raffles) {
        setRaffles(res.raffles);

        setSelectedRaffleIdState((prevId) => {
          // 1. Si el ID previo aún existe en la lista de rifas, conservarlo
          if (prevId && res.raffles.some((r) => r.id === prevId)) {
            return prevId;
          }

          // 2. Si hay una rifa con estado 'active', priorizarla
          const activeRaffle = res.raffles.find((r) => r.status === 'active');
          if (activeRaffle) {
            localStorage.setItem(STORAGE_KEY, activeRaffle.id);
            return activeRaffle.id;
          }

          // 3. Fallback: la primera rifa disponible (la más reciente)
          if (res.raffles.length > 0) {
            localStorage.setItem(STORAGE_KEY, res.raffles[0].id);
            return res.raffles[0].id;
          }

          localStorage.removeItem(STORAGE_KEY);
          return null;
        });
      }
    } catch (err) {
      console.error('[AdminRaffleContext] Error al cargar rifas:', err);
    } finally {
      setIsLoadingRaffles(false);
    }
  }, []);

  useEffect(() => {
    void reloadRaffles();
  }, [reloadRaffles]);

  const setSelectedRaffleId = useCallback((id: string) => {
    setSelectedRaffleIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedRaffle = useMemo(() => {
    if (!selectedRaffleId || raffles.length === 0) return null;
    return raffles.find((r) => r.id === selectedRaffleId) || null;
  }, [selectedRaffleId, raffles]);

  const value = useMemo<AdminRaffleContextValue>(
    () => ({
      selectedRaffleId,
      selectedRaffle,
      raffles,
      isLoadingRaffles,
      setSelectedRaffleId,
      reloadRaffles,
    }),
    [selectedRaffleId, selectedRaffle, raffles, isLoadingRaffles, setSelectedRaffleId, reloadRaffles]
  );

  return <AdminRaffleContext.Provider value={value}>{children}</AdminRaffleContext.Provider>;
};

export function useAdminRaffle(): AdminRaffleContextValue {
  const context = useContext(AdminRaffleContext);
  if (!context) {
    throw new Error('useAdminRaffle debe usarse dentro de un <AdminRaffleProvider>');
  }
  return context;
}

