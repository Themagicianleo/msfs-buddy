// Personal flight logbook, kept in browser storage with JSON backup/restore
// and CSV export.

import type { FlightPlan } from './simbrief';

export interface LogEntry {
  id: string;
  ofpId: string; // SimBrief OFP this entry came from, '' if entered by hand
  date: string; // YYYY-MM-DD (UTC)
  callsign: string;
  aircraft: string; // ICAO type, e.g. A20N
  reg: string;
  dep: string;
  arr: string;
  route: string;
  // Actual times, "HH:MM" UTC
  out: string;
  off: string;
  on: string;
  in: string;
  distance: number | null; // NM
  fuelUsed: number | null;
  fuelUnit: 'kgs' | 'lbs';
  landingRate: number | null; // fpm, entered as a positive number
  network: string; // Offline, VATSIM, IVAO, PilotEdge
  remarks: string;
}

export const NETWORKS = ['Offline', 'VATSIM', 'IVAO', 'PilotEdge'];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function utcNow() {
  const d = new Date();
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  };
}

export function emptyEntry(): LogEntry {
  return {
    id: newId(),
    ofpId: '',
    date: utcNow().date,
    callsign: '',
    aircraft: '',
    reg: '',
    dep: '',
    arr: '',
    route: '',
    out: '',
    off: '',
    on: '',
    in: '',
    distance: null,
    fuelUsed: null,
    fuelUnit: 'kgs',
    landingRate: null,
    network: 'Offline',
    remarks: '',
  };
}

export function entryFromPlan(plan: FlightPlan): LogEntry {
  return {
    ...emptyEntry(),
    ofpId: plan.id,
    callsign: plan.callsign || plan.flightNumber,
    aircraft: plan.aircraft.icao,
    reg: plan.aircraft.reg,
    dep: plan.origin.icao,
    arr: plan.destination.icao,
    route: plan.route,
    distance: plan.routeDistance,
    fuelUnit: plan.units,
  };
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

/** Minutes between two UTC "HH:MM" times, wrapping past midnight. */
export function duration(from: string, to: string): number | null {
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a === null || b === null) return null;
  return (b - a + 1440) % 1440;
}

export const blockMinutes = (e: LogEntry) => duration(e.out, e.in);
export const airMinutes = (e: LogEntry) => duration(e.off, e.on);

export function fmtMinutes(min: number | null): string {
  if (min === null) return '—';
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** Newest first: by date, then block-out time. */
export function sortEntries(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => (b.date + b.out).localeCompare(a.date + a.out));
}

export function stats(entries: LogEntry[]) {
  const sum = (f: (e: LogEntry) => number | null) => entries.reduce((acc, e) => acc + (f(e) ?? 0), 0);
  const rates = entries.map((e) => e.landingRate).filter((r): r is number => r !== null);
  const count = (key: (e: LogEntry) => string[]) => {
    const tally = new Map<string, number>();
    entries.forEach((e) => key(e).filter(Boolean).forEach((k) => tally.set(k, (tally.get(k) ?? 0) + 1)));
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };
  return {
    flights: entries.length,
    blockMinutes: sum(blockMinutes),
    airMinutes: sum(airMinutes),
    distance: sum((e) => e.distance),
    avgLandingRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
    softestLanding: rates.length ? Math.min(...rates) : null,
    topAircraft: count((e) => [e.aircraft]),
    topAirport: count((e) => [e.dep, e.arr]),
  };
}

const CSV_COLUMNS: [string, (e: LogEntry) => string | number | null][] = [
  ['Date', (e) => e.date],
  ['Callsign', (e) => e.callsign],
  ['Aircraft', (e) => e.aircraft],
  ['Registration', (e) => e.reg],
  ['From', (e) => e.dep],
  ['To', (e) => e.arr],
  ['Out (UTC)', (e) => e.out],
  ['Off (UTC)', (e) => e.off],
  ['On (UTC)', (e) => e.on],
  ['In (UTC)', (e) => e.in],
  ['Block time', (e) => fmtMinutes(blockMinutes(e))],
  ['Air time', (e) => fmtMinutes(airMinutes(e))],
  ['Distance (NM)', (e) => e.distance],
  ['Fuel used', (e) => e.fuelUsed],
  ['Fuel unit', (e) => e.fuelUnit],
  ['Landing rate (fpm)', (e) => e.landingRate],
  ['Network', (e) => e.network],
  ['Route', (e) => e.route],
  ['Remarks', (e) => e.remarks],
];

export function toCsv(entries: LogEntry[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sortEntries(entries).map((e) => CSV_COLUMNS.map(([, f]) => cell(f(e))).join(','));
  return [CSV_COLUMNS.map(([h]) => h).join(','), ...rows].join('\n');
}

export function toBackup(entries: LogEntry[]): string {
  return JSON.stringify({ app: 'msfs-buddy', kind: 'logbook', version: 1, entries }, null, 2);
}

/** Parse a backup file. Accepts our backup object or a bare array of entries. */
export function parseBackup(text: string): LogEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a logbook backup (invalid JSON).');
  }
  const list = Array.isArray(data) ? data : (data as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) throw new Error('That file is not a logbook backup.');
  const base = emptyEntry();
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: str(x.id) || newId(),
      ofpId: str(x.ofpId),
      date: str(x.date) || base.date,
      callsign: str(x.callsign),
      aircraft: str(x.aircraft),
      reg: str(x.reg),
      dep: str(x.dep),
      arr: str(x.arr),
      route: str(x.route),
      out: str(x.out),
      off: str(x.off),
      on: str(x.on),
      in: str(x.in),
      distance: num(x.distance),
      fuelUsed: num(x.fuelUsed),
      fuelUnit: x.fuelUnit === 'lbs' ? 'lbs' : 'kgs',
      landingRate: num(x.landingRate),
      network: str(x.network) || 'Offline',
      remarks: str(x.remarks),
    }));
}

/** Merge imported entries into the logbook; entries with the same id are replaced. */
export function mergeEntries(current: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const byId = new Map(current.map((e) => [e.id, e]));
  incoming.forEach((e) => byId.set(e.id, e));
  return [...byId.values()];
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
