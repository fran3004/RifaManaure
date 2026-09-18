import React, { createContext, useState, useEffect } from 'react';
import type { SystemSettingsRow } from '@/types/raffle.types';
import { getSystemSettings, DEFAULT_SYSTEM_SETTINGS } from '@/services/settingsService';
import { supabase } from '@/lib/supabase';

const SystemSettingsContext = createContext<SystemSettingsRow>(DEFAULT_SYSTEM_SETTINGS);

export const SystemSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettingsRow>(DEFAULT_SYSTEM_SETTINGS);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const data = await getSystemSettings();
        if (isMounted) {
          setSettings(data);
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
