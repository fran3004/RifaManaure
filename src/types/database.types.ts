/**
 * Tipos de esquema de base de datos PostgreSQL en Supabase para el sistema de rifas.
 * Compatible con @supabase/supabase-js v2.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          full_name: string | null;
          role: 'superadmin' | 'admin' | 'auditor';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          full_name?: string | null;
          role?: 'superadmin' | 'admin' | 'auditor';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email?: string;
          full_name?: string | null;
          role?: 'superadmin' | 'admin' | 'auditor';
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_accounts: {
        Row: {
          id: string;
          bank_name: string;
          account_type: string;
          account_number: string;
          account_holder: string;
          holder_document_id: string | null;
          qr_code_url: string | null;
          instructions: string | null;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bank_name: string;
          account_type?: string;
          account_number: string;
          account_holder: string;
          holder_document_id?: string | null;
          qr_code_url?: string | null;
          instructions?: string | null;
          is_active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bank_name?: string;
          account_type?: string;
          account_number?: string;
          account_holder?: string;
          holder_document_id?: string | null;
          qr_code_url?: string | null;
          instructions?: string | null;
          is_active?: boolean;
          display_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          performed_by: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action: string;
          entity_type: string;
          entity_id: string;
          performed_by?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          performed_by?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      raffles: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string;
          ticket_price: number;
          total_tickets: number;
          max_tickets_per_buyer: number;
          draw_date: string;
          lottery_reference: string;
          status: 'draft' | 'active' | 'paused' | 'closed' | 'finished';
          hero_image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          description: string;
          ticket_price: number;
          total_tickets: number;
          max_tickets_per_buyer?: number;
          draw_date: string;
          lottery_reference: string;
          status?: 'draft' | 'active' | 'paused' | 'closed' | 'finished';
          hero_image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          description?: string;
          ticket_price?: number;
          total_tickets?: number;
          max_tickets_per_buyer?: number;
          draw_date?: string;
          lottery_reference?: string;
          status?: 'draft' | 'active' | 'paused' | 'closed' | 'finished';
          hero_image_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          raffle_id: string;
          number: string;
          status: 'available' | 'reserved' | 'sold' | 'blocked';
          reserved_at: string | null;
          reservation_expires_at: string | null;
          buyer_id: string | null;
          order_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raffle_id: string;
          number: string;
          status?: 'available' | 'reserved' | 'sold' | 'blocked';
          reserved_at?: string | null;
          reservation_expires_at?: string | null;
          buyer_id?: string | null;
          order_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raffle_id?: string;
          number?: string;
          status?: 'available' | 'reserved' | 'sold' | 'blocked';
          reserved_at?: string | null;
          reservation_expires_at?: string | null;
          buyer_id?: string | null;
          order_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tickets_raffle_id_fkey';
            columns: ['raffle_id'];
            isOneToOne: false;
            referencedRelation: 'raffles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tickets_buyer_id_fkey';
            columns: ['buyer_id'];
            isOneToOne: false;
            referencedRelation: 'buyers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tickets_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      buyers: {
        Row: {
          id: string;
          full_name: string;
          document_id: string;
          phone: string;
          email: string;
          city: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          document_id: string;
          phone: string;
          email: string;
          city: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          document_id?: string;
          phone?: string;
          email?: string;
          city?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          raffle_id: string;
          buyer_id: string;
          reference: string;
          total_amount: number;
          ticket_count: number;
          status: 'pending' | 'pending_verification' | 'paid' | 'completed' | 'rejected' | 'expired' | 'cancelled' | 'refunded';
          payment_method: 'wompi' | 'bold' | 'mercadopago' | 'transfer_manual' | 'cash';
          payment_gateway_id: string | null;
          payment_gateway_data: Json | null;
          receipt_url: string | null;
          rejection_reason: string | null;
          contact_preference: 'whatsapp' | 'email' | 'both';
          verified_at: string | null;
          verified_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raffle_id: string;
          buyer_id: string;
          reference: string;
          total_amount: number;
          ticket_count: number;
          status?: 'pending' | 'pending_verification' | 'paid' | 'completed' | 'rejected' | 'expired' | 'cancelled' | 'refunded';
          payment_method?: 'wompi' | 'bold' | 'mercadopago' | 'transfer_manual' | 'cash';
          payment_gateway_id?: string | null;
          payment_gateway_data?: Json | null;
          receipt_url?: string | null;
          rejection_reason?: string | null;
          contact_preference?: 'whatsapp' | 'email' | 'both';
          verified_at?: string | null;
          verified_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raffle_id?: string;
          buyer_id?: string;
          reference?: string;
          total_amount?: number;
          ticket_count?: number;
          status?: 'pending' | 'pending_verification' | 'paid' | 'completed' | 'rejected' | 'expired' | 'cancelled' | 'refunded';
          payment_method?: 'wompi' | 'bold' | 'mercadopago' | 'transfer_manual' | 'cash';
          payment_gateway_id?: string | null;
          payment_gateway_data?: Json | null;
          receipt_url?: string | null;
          rejection_reason?: string | null;
          contact_preference?: 'whatsapp' | 'email' | 'both';
          verified_at?: string | null;
          verified_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_raffle_id_fkey';
            columns: ['raffle_id'];
            isOneToOne: false;
            referencedRelation: 'raffles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_buyer_id_fkey';
            columns: ['buyer_id'];
            isOneToOne: false;
            referencedRelation: 'buyers';
            referencedColumns: ['id'];
          },
        ];
      };
      partners: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: string;
          description: string | null;
          logo_url: string | null;
          website_url: string | null;
          instagram_url: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category: string;
          description?: string | null;
          logo_url?: string | null;
          website_url?: string | null;
          instagram_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          category?: string;
          description?: string | null;
          logo_url?: string | null;
          website_url?: string | null;
          instagram_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_proofs: {
        Row: {
          id: string;
          raffle_id: string;
          order_id: string;
          buyer_id: string;
          file_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          status: 'pending' | 'approved' | 'rejected';
          payment_reference: string | null;
          rejection_reason: string | null;
          verified_by: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raffle_id: string;
          order_id: string;
          buyer_id: string;
          file_path: string;
          file_name: string;
          file_size: number;
          mime_type: string;
          status?: 'pending' | 'approved' | 'rejected';
          payment_reference?: string | null;
          rejection_reason?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raffle_id?: string;
          order_id?: string;
          buyer_id?: string;
          file_path?: string;
          file_name?: string;
          file_size?: number;
          mime_type?: string;
          status?: 'pending' | 'approved' | 'rejected';
          payment_reference?: string | null;
          rejection_reason?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          id: string;
          order_id: string;
          event_type: 'payment_received' | 'payment_approved' | 'payment_rejected' | 'PAYMENT_RECEIVED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED';
          channel: 'email' | 'whatsapp' | 'sms';
          recipient: string;
          status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
          attempts: number;
          error_message: string | null;
          idempotency_key: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_type: 'payment_received' | 'payment_approved' | 'payment_rejected' | 'PAYMENT_RECEIVED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED';
          channel?: 'email' | 'whatsapp' | 'sms';
          recipient: string;
          status?: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
          attempts?: number;
          error_message?: string | null;
          idempotency_key: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          event_type?: 'payment_received' | 'payment_approved' | 'payment_rejected' | 'PAYMENT_RECEIVED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED';
          channel?: 'email' | 'whatsapp' | 'sms';
          recipient?: string;
          status?: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
          attempts?: number;
          error_message?: string | null;
          idempotency_key?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_logs_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      winners: {
        Row: {
          id: string;
          raffle_id: string;
          order_id: string;
          buyer_id: string;
          ticket_id: string | null;
          ticket_number: string;
          lottery_draw_number: string;
          draw_date: string;
          official_act_url: string | null;
          delivery_photos: string[];
          notes: string | null;
          registered_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raffle_id: string;
          order_id: string;
          buyer_id: string;
          ticket_id?: string | null;
          ticket_number: string;
          lottery_draw_number: string;
          draw_date?: string;
          official_act_url?: string | null;
          delivery_photos?: string[];
          notes?: string | null;
          registered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raffle_id?: string;
          order_id?: string;
          buyer_id?: string;
          ticket_id?: string | null;
          ticket_number?: string;
          lottery_draw_number?: string;
          draw_date?: string;
          official_act_url?: string | null;
          delivery_photos?: string[];
          notes?: string | null;
          registered_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_settings: {
        Row: {
          id: number;
          reservation_duration_minutes: number;
          max_tickets_per_buyer: number;
          support_whatsapp_number: string | null;
          support_email: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: number;
          reservation_duration_minutes?: number;
          max_tickets_per_buyer?: number;
          support_whatsapp_number?: string | null;
          support_email?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: number;
          reservation_duration_minutes?: number;
          max_tickets_per_buyer?: number;
          support_whatsapp_number?: string | null;
          support_email?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      prize_settings: {
        Row: {
          id: string;
          badge_text: string;
          title: string;
          subtitle: string;
          official_tour_badge: string;
          official_tour_title: string;
          official_tour_subtitle: string;
          official_tour_features: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          badge_text?: string;
          title?: string;
          subtitle?: string;
          official_tour_badge?: string;
          official_tour_title?: string;
          official_tour_subtitle?: string;
          official_tour_features?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          badge_text?: string;
          title?: string;
          subtitle?: string;
          official_tour_badge?: string;
          official_tour_title?: string;
          official_tour_subtitle?: string;
          official_tour_features?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      prize_experiences: {
        Row: {
          id: string;
          title: string;
          partner_name: string;
          description: string;
          features: Json;
          image_url: string | null;
          image_slug: string | null;
          icon: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          partner_name: string;
          description: string;
          features?: Json;
          image_url?: string | null;
          image_slug?: string | null;
          icon?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          partner_name?: string;
          description?: string;
          features?: Json;
          image_url?: string | null;
          image_slug?: string | null;
          icon?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      faq_items: {
        Row: {
          id: string;
          question: string;
          answer: string;
          sort_order: number;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question: string;
          answer: string;
          sort_order?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          question?: string;
          answer?: string;
          sort_order?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      gallery_items: {
        Row: {
          id: string;
          raffle_id: string | null;
          title: string;
          category: string;
          image_slug: string | null;
          image_url: string | null;
          alt_text: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          raffle_id?: string | null;
          title: string;
          category?: string;
          image_slug?: string | null;
          image_url?: string | null;
          alt_text?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          raffle_id?: string | null;
          title?: string;
          category?: string;
          image_slug?: string | null;
          image_url?: string | null;
          alt_text?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: {
          p_user_id?: string;
        };
        Returns: boolean;
      };
      reserve_tickets: {
        Args: {
          p_raffle_id: string;
          p_ticket_numbers: string[];
          p_buyer_id: string;
          p_duration_minutes?: number;
        };
        Returns: Json;
      };
      release_expired_reservations: {
        Args: Record<string, never>;
        Returns: number;
      };
      submit_order_receipt: {
        Args: {
          p_order_id: string;
          p_receipt_url: string;
          p_payment_reference?: string;
        };
        Returns: Json;
      };
      approve_order_payment: {
        Args: {
          p_order_id: string;
        };
        Returns: Json;
      };
      reject_order_payment: {
        Args: {
          p_order_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      confirm_order_payment: {
        Args: {
          p_order_id: string;
          p_gateway_id?: string;
          p_gateway_data?: Json;
        };
        Returns: boolean;
      };
      cancel_order: {
        Args: {
          p_order_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      submit_payment_proof: {
        Args: {
          p_order_id: string;
          p_file_path: string;
          p_file_name: string;
          p_file_size: number;
          p_mime_type: string;
          p_payment_reference?: string;
        };
        Returns: Json;
      };
      admin_block_ticket: {
        Args: {
          p_ticket_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      admin_unblock_ticket: {
        Args: {
          p_ticket_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      create_order_secure: {
        Args: {
          p_raffle_id: string;
          p_ticket_numbers: string[];
          p_buyer_data: Json;
          p_payment_method?: string;
          p_contact_preference?: string;
        };
        Returns: Json;
      };
      verify_public_order_or_tickets: {
        Args: {
          p_search_term: string;
        };
        Returns: Json;
      };
      admin_update_buyer: {
        Args: {
          p_buyer_id: string;
          p_full_name: string;
          p_phone: string;
          p_email: string;
          p_city: string;
        };
        Returns: Json;
      };
      admin_update_raffle: {
        Args: {
          p_raffle_id: string;
          p_title: string;
          p_description: string;
          p_ticket_price: number;
          p_draw_date: string;
          p_lottery_reference: string;
          p_status: string;
          p_max_tickets_per_buyer?: number;
        };
        Returns: Json;
      };
      admin_create_raffle: {
        Args: {
          p_title: string;
          p_slug: string;
          p_description: string;
          p_ticket_price: number;
          p_total_tickets: number;
          p_max_tickets_per_buyer: number;
          p_draw_date: string;
          p_lottery_reference: string;
          p_status?: string;
        };
        Returns: Json;
      };
      register_winner: {
        Args: {
          p_raffle_id: string;
          p_ticket_number: string;
          p_lottery_draw_number: string;
          p_draw_date?: string;
          p_official_act_url?: string | null;
          p_delivery_photos?: string[];
          p_notes?: string | null;
        };
        Returns: Json;
      };
      admin_update_system_settings: {
        Args: {
          p_reservation_duration_minutes: number;
          p_max_tickets_per_buyer: number;
          p_support_whatsapp_number: string;
          p_support_email: string;
        };
        Returns: Json;
      };
      admin_list_users: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      admin_invite_user: {
        Args: {
          p_email: string;
          p_role: string;
          p_full_name?: string | null;
        };
        Returns: Json;
      };
      admin_toggle_user_status: {
        Args: {
          p_admin_user_id: string;
          p_is_active: boolean;
        };
        Returns: Json;
      };
      get_dashboard_kpis: {
        Args: {
          p_raffle_id?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
