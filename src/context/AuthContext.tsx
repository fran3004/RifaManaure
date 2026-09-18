import React, { useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { AuthContext } from './AuthContextDefinition';
import {
  signInAdmin,
  signOutAdmin,
  checkAdminAuthorization,
  type AdminUserRow,
} from '@/services/authService';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUserRow | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Valida si el usuario actual tiene permisos de administrador activos
  const verifyAdmin = useCallback(
    async (currentUser: User | null): Promise<AdminUserRow | null> => {
      if (!currentUser) {
        setAdminProfile(null);
        setIsAdmin(false);
        return null;
      }

      const profile = await checkAdminAuthorization(currentUser.id, currentUser.email || '');
      if (profile && profile.is_active) {
        setAdminProfile(profile);
        setIsAdmin(true);
        return profile;
      } else {
        setAdminProfile(null);
        setIsAdmin(false);
        return null;
      }
    },
    []
  );

  const refreshAdminStatus = useCallback(async () => {
    if (user) {
      await verifyAdmin(user);
    }
  }, [user, verifyAdmin]);

  // Carga inicial de sesión y suscripción a cambios de auth
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          console.error('Error al obtener sesión inicial de Supabase Auth:', error);
        }

        if (isMounted) {
          if (currentSession?.user) {
            setSession(currentSession);
            setUser(currentSession.user);
            await verifyAdmin(currentSession.user);
          } else {
            setSession(null);
            setUser(null);
            setAdminProfile(null);
            setIsAdmin(false);
          }
        }
      } catch (err) {
        console.error('Error inesperado al inicializar Auth:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initAuth();

    // Escuchar cambios de estado en Supabase Auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !newSession?.user) {
        setSession(null);
        setUser(null);
        setAdminProfile(null);
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      setSession(newSession);
      setUser(newSession.user);
      await verifyAdmin(newSession.user);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [verifyAdmin]);

  const signIn = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await signInAdmin(email, pass);

      if (result.error) {
        setIsLoading(false);
        return { success: false, error: result.error };
      }

      setUser(result.user);
      setSession(result.session);
      setAdminProfile(result.adminProfile);
      setIsAdmin(result.isAdmin);
      setIsLoading(false);

      return { success: true };
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Error al procesar el inicio de sesión.';
      return { success: false, error: msg };
    }
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOutAdmin();
    } finally {
      setUser(null);
      setSession(null);
      setAdminProfile(null);
      setIsAdmin(false);
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        adminProfile,
        isAdmin,
        isLoading,
        signIn,
        signOut,
        refreshAdminStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
