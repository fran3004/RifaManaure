import { createContext } from 'react';
import type {
  TicketPublicStateRow,
  RaffleRow,
  WinnerWithDetails,
  SystemSettingsRow,
} from '@/types/raffle.types';
import type { TicketStats } from '@/config/ticketSocialProof';

export interface TicketCartContextType {
  raffle: RaffleRow | null;
  winner: WinnerWithDetails | null;
  systemSettings: SystemSettingsRow | null;
  tickets: TicketPublicStateRow[];
  ticketStats: TicketStats;
  selectedTickets: string[];
  isLoading: boolean;
  unitPrice: number;
  totalAmount: number;
  maxTicketsPerBuyer: number;
  toggleTicketSelection: (number: string) => void;
  selectRandomTickets: (count: number) => void;
  clearSelection: () => void;
  refreshTickets: () => Promise<void>;
  isCheckoutOpen: boolean;
  openCheckout: () => void;
  closeCheckout: () => void;
  showToast: (
    type: 'warning' | 'info' | 'error' | 'success',
    title: string,
    message: string,
    duration?: number
  ) => void;
}

export const TicketCartContext = createContext<TicketCartContextType | undefined>(undefined);
