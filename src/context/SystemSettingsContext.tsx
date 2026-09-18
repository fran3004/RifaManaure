import React, { createContext, useState, useEffect } from 'react';
import type { SystemSettingsRow } from '@/types/raffle.types';
import { getSystemSettings, DEFAULT_SYSTEM_SETTINGS } from '@/services/settingsService';
import { supabase } from '@/lib/supabase';

const SETTINGS_CACHE_KEY = 'manaure_system_settings_cache';

function getCachedSettings(): SystemSettingsRow {
  try {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    }
  } catch {
    // Ignorar errores de cache
  }
  return DEFAULT_SYSTEM_SETTINGS;
}

const SystemSettingsContext = createContext<SystemSettingsRow>(DEFAULT_SYSTEM_SETTINGS);

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettingsRow>(getCachedSettings);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const data = await getSystemSettings();
        if (isMounted) {
          setSettings(data);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[SystemSettingsProvider] Error al cargar configuración inicial:', err);
      }
    }

    void load();

    // Canal único global para toda la aplicación
    const channel = supabase
      .channel('system_settings_global_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
        },
        async () => {
          try {
            const fresh = await getSystemSettings();
            if (isMounted) {
              setSettings(fresh);
              try {
                if (typeof window !== 'undefined') {
                  localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(fresh));
                }
              } catch {}
            }
          } catch (err) {
            console.warn(
              '[SystemSettingsProvider] Error al refrescar configuración en tiempo real:',
              err
            );
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <SystemSettingsContext.Provider value={settings}>{children}</SystemSettingsContext.Provider>
  );
};

export { SystemSettingsContext };
