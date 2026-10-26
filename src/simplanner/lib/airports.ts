// Airports and runways: the open OurAirports data set (imported into the
// browser once) plus airports you add by hand. Your own entries always win,
// so you can fix or add airports such as ZUDC or ZUNZ.

import type { NavDataProvider, NavFix } from './navdata';

export interface Runway {
  ident: string; // e.g. 36R
  lengthFt: number | null;
  /** Heading in degrees. OurAirports gives TRUE headings; for your own entries, note which you used. */
  headingDeg: number | null;
  surface?: string;
}

export interface Airport {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number | null;
  runways: Runway[];
  country?: string;
  city?: string;
  source: 'custom' | 'ourairports';
}

/** Compact row as stored in IndexedDB: [icao, name, lat, lon, elevation, country, city, alias]. */
export type AirportRow = [string, string, number, number, number | null, string, string, string];
/** [ident, lengthFt, headingTrue, surface] */
export type RunwayRow = [string, number | null, number | null, string];

export interface AirportDataset {
  importedAt: string;
  source: string;
  airports: AirportRow[];
  runways: Record<string, RunwayRow[]>;
}

/** RFC 4180 CSV parser (quoted fields, doubled quotes, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function table(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const KEEP_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);
const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);

/**
 * Convert OurAirports airports.csv + runways.csv into the compact dataset.
 * The ICAO code is taken from icao_code, else a 4-letter gps_code, else ident.
 */
export function buildDataset(airportsCsv: string, runwaysCsv: string, source = 'OurAirports'): AirportDataset {
  const airports: AirportRow[] = [];
  const keyByIdent = new Map<string, string>();
  for (const a of table(airportsCsv)) {
    if (!KEEP_TYPES.has(a.type)) continue;
    const lat = Number(a.latitude_deg);
    const lon = Number(a.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const icao = (a.icao_code || (/^[A-Z]{4}$/.test(a.gps_code) ? a.gps_code : '') || a.ident).toUpperCase();
    keyByIdent.set(a.ident, icao);
    airports.push([icao, a.name, lat, lon, num(a.elevation_ft), a.iso_country ?? '', a.municipality ?? '', a.ident !== icao ? a.ident.toUpperCase() : '']);
  }
  const runways: Record<string, RunwayRow[]> = {};
  for (const r of table(runwaysCsv)) {
    if (r.closed === '1') continue;
    const key = keyByIdent.get(r.airport_ident);
    if (!key) continue;
    const list = (runways[key] ??= []);
    const len = num(r.length_ft);
    if (r.le_ident) list.push([r.le_ident.toUpperCase(), len, num(r.le_heading_degT), r.surface ?? '']);
    if (r.he_ident) list.push([r.he_ident.toUpperCase(), len, num(r.he_heading_degT), r.surface ?? '']);
  }
  return { importedAt: new Date().toISOString(), source, airports, runways };
}

/** In-memory lookup over the imported dataset and your custom airports. */
export class AirportIndex {
  private byIcao = new Map<string, Airport>();
  private custom = new Map<string, Airport>();
  readonly count: number;

  constructor(dataset: AirportDataset | null, custom: Airport[]) {
    for (const row of dataset?.airports ?? []) {
      const [icao, name, lat, lon, elevationFt, country, city, alias] = row;
      const runways = (dataset!.runways[icao] ?? []).map(([ident, lengthFt, headingDeg, surface]) => ({ ident, lengthFt, headingDeg, surface }));
      const apt: Airport = { icao, name, lat, lon, elevationFt, runways, country, city, source: 'ourairports' };
      this.byIcao.set(icao, apt);
      if (alias && !this.byIcao.has(alias)) this.byIcao.set(alias, apt);
    }
    for (const a of custom) this.custom.set(a.icao.toUpperCase(), { ...a, source: 'custom' });
    this.count = dataset?.airports.length ?? 0;
  }

  get(icao: string): Airport | null {
    const k = icao.trim().toUpperCase();
    return this.custom.get(k) ?? this.byIcao.get(k) ?? null;
  }

  search(q: string, limit = 25): Airport[] {
    const query = q.trim().toUpperCase();
    if (query.length < 2) return [];
    const out: Airport[] = [];
    const seen = new Set<Airport>();
    const push = (a: Airport) => {
      if (!seen.has(a) && out.length < limit) {
        seen.add(a);
        out.push(a);
      }
    };
    const exact = this.get(query);
    if (exact) push(exact);
    for (const a of [...this.custom.values(), ...this.byIcao.values()]) {
      if (out.length >= limit) break;
      if (a.icao.startsWith(query) || a.name.toUpperCase().includes(query) || (a.city ?? '').toUpperCase().includes(query)) push(a);
    }
    return out;
  }

  toFix(a: Airport): NavFix {
    return { ident: a.icao, lat: a.lat, lon: a.lon, name: a.name, type: 'airport', source: a.source === 'custom' ? 'My airports' : 'OurAirports' };
  }

  provider(): NavDataProvider {
    return {
      id: 'airports',
      name: 'Airports',
      findFix: (ident) => {
        if (!/^[A-Z0-9]{3,4}$/.test(ident)) return [];
        const a = this.get(ident);
        return a ? [this.toFix(a)] : [];
      },
    };
  }
}

export const OURAIRPORTS_URLS = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  runways: 'https://davidmegginson.github.io/ourairports-data/runways.csv',
};
