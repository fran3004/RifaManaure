import { useContext } from 'react';
import { SystemSettingsContext } from '@/context/SystemSettingsContext';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/settingsService';
import type { SystemSettingsRow } from '@/types/raffle.types';

export const useSystemSettings = (): SystemSettingsRow => {
  return useContext(SystemSettingsContext) || DEFAULT_SYSTEM_SETTINGS;
};
