import type { Database } from './database.types';

export type RaffleRow = Database['public']['Tables']['raffles']['Row'];
export type TicketRow = Database['public']['Tables']['tickets']['Row'];
export type BuyerRow = Database['public']['Tables']['buyers']['Row'];
export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type PartnerRow = Database['public']['Tables']['partners']['Row'];
export type PaymentAccountRow = Database['public']['Tables']['payment_accounts']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type PaymentProofRow = Database['public']['Tables']['payment_proofs']['Row'];

export type WinnerRow = Database['public']['Tables']['winners']['Row'];

export interface WinnerWithDetails extends WinnerRow {
  raffle?: {
    id: string;
    title: string;
    lottery_reference: string;
    ticket_price: number;
  };
  buyer?: {
    id: string;
    full_name: string;
    document_id: string;
    phone: string;
    email: string;
    city: string;
  };
  order?: {
    id: string;
    reference: string;
    created_at: string;
    total_amount: number;
  };
}

export interface RegisterWinnerPayload {
  raffleId: string;
  ticketNumber: string;
  lotteryDrawNumber: string;
  drawDate?: string;
  officialActUrl?: string | null;
  notes?: string | null;
}

export type TicketStatus = TicketRow['status'];
export type PaymentStatus = OrderRow['status'];
export type PaymentMethod = OrderRow['payment_method'];

export interface TicketItem {
  id: string;
  number: string;
  formattedNumber: string;
  status: TicketStatus;
  price: number;
}

export type ContactPreference = 'whatsapp';

export interface BuyerFormData {
  fullName: string;
  documentId: string;
  phone: string;
  email: string;
  city: string;
  contactPreference: ContactPreference;
  acceptTerms: boolean;
}

export interface CartState {
  selectedTickets: string[]; // Lista de números, ej: ["012", "458"]
  raffleId: string;
  unitPrice: number;
  totalAmount: number;
}

export interface PrizeExperience {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'cuatrimoto' | 'parapente' | 'glamping' | 'gastronomia' | 'ecoturismo';
  partnerName: string;
  imageSlug: string;
  highlights: string[];
}

export type SystemSettingsRow = Database['public']['Tables']['system_settings']['Row'];

export interface UpdateSystemSettingsParams {
  reservationDurationMinutes: number;
  maxTicketsPerBuyer: number;
  supportWhatsappNumber: string;
  supportEmail: string;
}

export interface SystemSettingsResponse {
  success: boolean;
  settings?: SystemSettingsRow;
  error?: string;
  message?: string;
}

export interface OfficialTourFeature {
  [key: string]: string | undefined;
  id?: string;
  title: string;       // Ej: "Viaje ida y vuelta pago:"
  description: string; // Ej: "desde tu lugar de residencia hasta Manaure – Cesar para la pareja (2 personas)"
  icon?: string;
}

export type PrizeSettingsRow = Database['public']['Tables']['prize_settings']['Row'];
export type PrizeSettingsUpdate = Database['public']['Tables']['prize_settings']['Update'];

export type PrizeExperienceRow = Database['public']['Tables']['prize_experiences']['Row'];
export type PrizeExperienceInsert = Database['public']['Tables']['prize_experiences']['Insert'];
export type PrizeExperienceUpdate = Database['public']['Tables']['prize_experiences']['Update'];

export interface PublicPrizeData {
  settings: PrizeSettingsRow;
  experiences: PrizeExperienceRow[];
}

export type FaqItemRow = Database['public']['Tables']['faq_items']['Row'];
export type FaqItemInsert = Database['public']['Tables']['faq_items']['Insert'];
export type FaqItemUpdate = Database['public']['Tables']['faq_items']['Update'];

export interface FaqItem {
  id?: string;
  question: string;
  answer: string;
  sort_order?: number;
  is_published?: boolean;
}

export interface FaqCachePayload {
  version: number;
  timestamp: number;
  data: FaqItem[];
}

export type GalleryItemRow = Database['public']['Tables']['gallery_items']['Row'];
export type GalleryItemInsert = Database['public']['Tables']['gallery_items']['Insert'];
export type GalleryItemUpdate = Database['public']['Tables']['gallery_items']['Update'];

export type GalleryCategory =
  | 'cuatrimoto'
  | 'parapente'
  | 'serrania'
  | 'hospedaje'
  | 'gastronomia'
  | 'fogata'
  | 'otro';

export interface GalleryCachePayload {
  version: number;
  timestamp: number;
  data: GalleryItemRow[];
}

