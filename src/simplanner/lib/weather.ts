// METAR/TAF from the NOAA Aviation Weather Center API (aviationweather.gov),
// with VATSIM's METAR feed as a fallback (shared with the MSFS Buddy EFB).
// The last good reports are cached so a briefing still shows something
// when you're offline, clearly marked with their age.

import { fetchWeather } from '../../lib/metar';

export interface StationWeather {
  metar: string;
  taf: string;
  fetchedAt: string; // when SimPlanner downloaded it
  source: string;
}

export interface WeatherResult {
  stations: Record<string, StationWeather>;
  offline: boolean;
  message: string;
}

const CACHE_KEY = 'simplanner.weather';

type Fetcher = (ids: string[]) => Promise<{ metar: Record<string, string>; taf: Record<string, string>; source: string }>;

function readCache(): Record<string, StationWeather> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export async function getWeather(icaos: string[], fetcher: Fetcher = fetchWeather): Promise<WeatherResult> {
  const ids = [...new Set(icaos.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9]{4}$/.test(x)))];
  const cache = readCache();
  const stations: Record<string, StationWeather> = {};
  let live: Awaited<ReturnType<Fetcher>> | null = null;
  try {
    if (ids.length) live = await fetcher(ids);
  } catch {
    live = null;
  }
  const now = new Date().toISOString();
  let missing = 0;
  for (const id of ids) {
    const metar = live?.metar[id];
    if (metar) {
      stations[id] = { metar, taf: live?.taf[id] ?? '', fetchedAt: now, source: live?.source || 'aviationweather.gov' };
      cache[id] = stations[id];
    } else if (cache[id]) {
      stations[id] = cache[id];
      missing++;
    } else missing++;
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  const offline = !live || Object.keys(live.metar).length === 0;
  const message = !ids.length
    ? ''
    : offline
      ? 'Live weather could not be fetched (offline, or the weather service is unreachable). Showing the last saved reports where available.'
      : missing
        ? 'Some airports have no current METAR; older saved reports are shown where available.'
        : '';
  return { stations, offline, message };
}

/** "12 min ago", for showing how old a cached report is. */
export function age(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
