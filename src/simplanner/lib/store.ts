// Everything you create is kept in this browser (localStorage), with a
// JSON backup file to move it to another device or keep a copy. The
// imported OurAirports list lives in IndexedDB and is not in the backup
// (re-import it instead).

import type { Airport } from './airports';
import type { CustomWaypoint } from './navdata';
import type { PlanInputs } from './planning';
import type { AircraftProfile } from './profiles';

export interface FlightInputs extends PlanInputs {
  dep: string;
  arr: string;
  altn: string;
  route: string;
  depRwy: string;
  arrRwy: string;
  flightNo: string;
  /** How Generate flight builds the route. */
  routeMode: 'navaids' | 'direct' | 'manual';
  autoCruise: boolean;
  autoAlternate: boolean;
  autoRunways: boolean;
  /** Set by Generate flight: how the runways were chosen. */
  runwayNotes?: string;
  routeNote?: string;
}

export interface SavedFlight {
  id: string;
  savedAt: string;
  inputs: FlightInputs;
}

export interface StoreData {
  profiles: Record<string, AircraftProfile>; // your edits, keyed by id (overrides defaults)
  templates: Record<string, string>; // your edited FMC templates, keyed by template id
  airports: Airport[];
  waypoints: CustomWaypoint[];
  flights: SavedFlight[];
  draft: FlightInputs | null;
}

const PREFIX = 'simplanner.';
const KEYS: (keyof StoreData)[] = ['profiles', 'templates', 'airports', 'waypoints', 'flights', 'draft'];
const EMPTY: StoreData = { profiles: {}, templates: {}, airports: [], waypoints: [], flights: [], draft: null };

function read<K extends keyof StoreData>(key: K): StoreData[K] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? EMPTY[key] : (JSON.parse(raw) as StoreData[K]);
  } catch {
    return EMPTY[key];
  }
}

export function loadStore(): StoreData {
  return Object.fromEntries(KEYS.map((k) => [k, read(k)])) as unknown as StoreData;
}

export function saveKey<K extends keyof StoreData>(key: K, value: StoreData[K]) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private mode or storage full; the change only lasts until reload.
  }
}

export interface Backup {
  app: 'simplanner';
  version: 1;
  exportedAt: string;
  data: Omit<StoreData, 'draft'>;
}

export function makeBackup(s: StoreData): Backup {
  const { draft: _draft, ...data } = s;
  return { app: 'simplanner', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Validate a backup file and merge it in (same ids/idents are replaced). */
export function mergeBackup(current: StoreData, text: string): { next: StoreData; summary: string } {
  let b: Backup;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (b?.app !== 'simplanner' || !b.data) throw new Error('That file is not a SimPlanner backup.');
  const d = b.data;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});
  const byKey = <T>(cur: T[], inc: T[], key: (x: T) => string) => {
    const m = new Map(cur.map((x) => [key(x), x]));
    inc.forEach((x) => m.set(key(x), x));
    return [...m.values()];
  };
  const airports = arr<Airport>(d.airports).filter((a) => a && typeof a.icao === 'string');
  const waypoints = arr<CustomWaypoint>(d.waypoints).filter((w) => w && typeof w.ident === 'string');
  const flights = arr<SavedFlight>(d.flights).filter((f) => f && typeof f.id === 'string' && f.inputs);
  const profiles = obj<AircraftProfile>(d.profiles);
  const templates = obj<string>(d.templates);
  const next: StoreData = {
    ...current,
    profiles: { ...current.profiles, ...profiles },
    templates: { ...current.templates, ...templates },
    airports: byKey(current.airports, airports, (a) => a.icao.toUpperCase()),
    waypoints: byKey(current.waypoints, waypoints, (w) => `${w.ident.toUpperCase()}@${w.lat},${w.lon}`),
    flights: byKey(current.flights, flights, (f) => f.id),
  };
  const summary = `${flights.length} flights, ${airports.length} airports, ${waypoints.length} waypoints, ${Object.keys(profiles).length} profiles, ${Object.keys(templates).length} templates`;
  return { next, summary };
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Share links ----------
// A flight (or a briefing snapshot) packed into the URL fragment, so a phone,
// tablet or sim EFB can open it without any server. The fragment (#...) is
// never sent to a web server.

export function encodeShare(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare<T>(s: string): T {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
