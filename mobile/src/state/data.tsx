import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { fetchSnapshot } from '@/lib/api';
import { generateDemoSnapshot } from '@/lib/demo';
import { indexSnapshot, type Indexed } from '@/lib/stats';
import type { Snapshot } from '@/lib/types';

import { useSettings } from './settings';

/** Days of history shown in Insights (plus today). */
export const HISTORY_DAYS = 7;

type DataContextValue = {
  snapshot: Snapshot | null;
  index: Indexed | null;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  refreshing: boolean;
  /** Set when the last refresh failed; older data may still be shown. */
  error: string | null;
  refresh: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { settings, loaded } = useSettings();
  const { source, serverUrl, refreshSec } = settings;

  // Results are tagged with the source they came from, so switching source
  // shows a clean loading state instead of the previous source's rooms.
  const sourceKey = `${source}|${serverUrl}`;
  const [result, setResult] = useState<{
    sourceKey: string;
    snapshot: Snapshot | null;
    error: string | null;
  }>({ sourceKey, snapshot: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  // Ignore responses from a request that was superseded (e.g. source changed).
  const requestId = useRef(0);

  const current = result.sourceKey === sourceKey ? result : null;
  const snapshot = current?.snapshot ?? null;
  const error = current?.error ?? null;

  const load = useCallback(() => {
    const id = ++requestId.current;
    const request =
      source === 'demo'
        ? Promise.resolve(generateDemoSnapshot(Date.now(), HISTORY_DAYS))
        : fetchSnapshot(serverUrl, HISTORY_DAYS);
    return request.then(
      (next) => {
        if (id !== requestId.current) return;
        setResult({ sourceKey, snapshot: next, error: null });
      },
      (e: unknown) => {
        if (id !== requestId.current) return;
        const message = e instanceof Error ? e.message : 'Something went wrong loading data.';
        // Keep showing the last good data from this source, if there is any.
        setResult((prev) => ({
          sourceKey,
          snapshot: prev.sourceKey === sourceKey ? prev.snapshot : null,
          error: message,
        }));
      },
    );
  }, [source, serverUrl, sourceKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Load when settings are ready and again whenever the data source changes.
  useEffect(() => {
    if (loaded) load();
  }, [loaded, load]);

  // Poll while the app is in the foreground, and catch up when it returns.
  useEffect(() => {
    if (!loaded) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer && refreshSec > 0) timer = setInterval(load, refreshSec * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        load();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [loaded, load, refreshSec]);

  const index = useMemo(() => (snapshot ? indexSnapshot(snapshot) : null), [snapshot]);

  const value = useMemo(
    () => ({
      snapshot,
      index,
      loading: !snapshot && !error,
      refreshing,
      error,
      refresh,
    }),
    [snapshot, index, refreshing, error, refresh],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
