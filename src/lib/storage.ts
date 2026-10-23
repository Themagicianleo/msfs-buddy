import { useEffect, useState } from 'react';

const PREFIX = 'msfs-buddy.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode); settings just won't persist.
  }
}

/** useState that persists to localStorage. */
export function usePersistent<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue] as const;
}

export interface Settings {
  simbriefUser: string;
  corsProxy: string;
  autoRefreshWx: boolean;
  clock24: boolean;
  showLocalTime: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  simbriefUser: '',
  corsProxy: '',
  autoRefreshWx: true,
  clock24: true,
  showLocalTime: true,
};
