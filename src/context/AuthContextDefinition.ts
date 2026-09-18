import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { AdminUserRow } from '@/services/authService';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: AdminUserRow | null;
  isAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshAdminStatus: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
