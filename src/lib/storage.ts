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

const URL_PARAM = 'user';

/**
 * A SimBrief user in the page URL (?user=123456) overrides the saved one, so a
 * bookmark or Home Screen icon keeps working even if browser storage is wiped.
 * Call before the app first renders.
 */
export function importUserFromUrl() {
  const user = new URLSearchParams(location.search).get(URL_PARAM)?.trim();
  if (!user) return;
  const settings = load<Partial<Settings>>('settings', {});
  if (settings.simbriefUser !== user) save('settings', { ...DEFAULT_SETTINGS, ...settings, simbriefUser: user });
}

/** Keep a ?user= already in the address bar in step with a changed username. */
export function syncUserInUrl(user: string) {
  const url = new URL(location.href);
  if (!url.searchParams.has(URL_PARAM)) return;
  if (user) url.searchParams.set(URL_PARAM, user);
  else url.searchParams.delete(URL_PARAM);
  history.replaceState(null, '', url);
}

/** Link that opens the EFB with this SimBrief user already set. */
export function personalLink(user: string) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set(URL_PARAM, user);
  return url.toString();
}

export interface Settings {
  simbriefUser: string;
  corsProxy: string;
  autoRefreshWx: boolean;
  clock24: boolean;
  showLocalTime: boolean;
  reduceTransparency: boolean;
  appearance: Appearance;
  /** OpenATC's address on the sim PC, as its helper window shows it. */
  openAtcUrl: string;
}

export type Appearance = 'system' | 'light' | 'dark';

export const DEFAULT_SETTINGS: Settings = {
  simbriefUser: '',
  corsProxy: '',
  autoRefreshWx: true,
  clock24: true,
  showLocalTime: true,
  reduceTransparency: false,
  appearance: 'system',
  openAtcUrl: '',
};
