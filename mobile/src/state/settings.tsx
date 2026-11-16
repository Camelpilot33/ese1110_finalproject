import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'obsv.settings.v1';

export type Settings = {
  /** 'demo' uses generated data; 'server' polls the Obsv backend. */
  source: 'demo' | 'server';
  serverUrl: string;
  /** Shows the Insights and Sensors tabs. */
  adminView: boolean;
  /** Seconds between automatic refreshes. */
  refreshSec: number;
  /** A room counts as empty after this many minutes without motion. */
  emptyAfterMin: number;
  favorites: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  source: 'demo',
  serverUrl: '',
  adminView: true,
  refreshSec: 30,
  emptyAfterMin: 10,
  favorites: [],
};

type SettingsContextValue = {
  settings: Settings;
  /** False until saved settings have been read from the device. */
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  toggleFavorite: (roomId: string) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      })
      .catch(() => {
        // Unreadable or missing settings: keep the defaults.
      })
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggleFavorite = useCallback(
    (roomId: string) => {
      setSettings((prev) => {
        const favorites = prev.favorites.includes(roomId)
          ? prev.favorites.filter((id) => id !== roomId)
          : [...prev.favorites, roomId];
        const next = { ...prev, favorites };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo(
    () => ({ settings, loaded, update, toggleFavorite }),
    [settings, loaded, update, toggleFavorite],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
