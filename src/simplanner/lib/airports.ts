// Airports, runways and radio navaids from the open OurAirports data set
// (public domain). A GitHub Action downloads it into this repository
// (public/data/), so the website ships it; nobody has to import anything.
// Airports you add by hand always win, so you can fix or add airports such
// as ZUDC or ZUNZ.

import { distanceNm, type LatLon } from './geo';
import type { NavDataProvider, NavFix } from './navdata';

export interface Runway {
  ident: string; // e.g. 36R
  lengthFt: number | null;
  /** Heading in degrees. OurAirports gives TRUE headings; for your own entries, note which you used. */
  headingDeg: number | null;
  surface?: string;
}

export type AirportSize = 'large' | 'medium' | 'small';

export interface Airport {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number | null;
  runways: Runway[];
  country?: string;
  city?: string;
  size?: AirportSize;
  /** OurAirports scheduled_service: has airline flights (undefined in older data). */
  scheduled?: boolean;
  source: 'custom' | 'ourairports';
}

export interface Navaid extends LatLon {
  ident: string;
  name: string;
  /** VOR, VOR-DME, VORTAC, TACAN, NDB, NDB-DME */
  type: string;
  /** OurAirports usage: HI, LO, BOTH, TERMINAL, RNAV or '' */
  usage: string;
  /** ISO country code ('' if unknown). */
  country: string;
  /** Where the beacon came from: OurAirports or openAIP. */
  source: 'ourairports' | 'openaip';
}

/** [icao, name, lat, lon, elevation, country, city, alias, size L/M/S, scheduled 1/0] */
export type AirportRow = [string, string, number, number, number | null, string, string, string, string?, number?];
/** [ident, lengthFt, headingTrue, surface] */
export type RunwayRow = [string, number | null, number | null, string];
/** [ident, name, type, lat, lon, usage, country, source o=OurAirports a=openAIP] */
export type NavaidRow = [string, string, string, number, number, string, string?, string?];

export interface AirportDataset {
  importedAt: string;
  source: string;
  airports: AirportRow[];
  runways: Record<string, RunwayRow[]>;
  navaids?: NavaidRow[];
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

const SIZE: Record<string, string> = { large_airport: 'L', medium_airport: 'M', small_airport: 'S' };
const SIZE_NAME: Record<string, AirportSize> = { L: 'large', M: 'medium', S: 'small' };
const NAVAID_TYPES = new Set(['VOR', 'VOR-DME', 'VORTAC', 'TACAN', 'NDB', 'NDB-DME']);
const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Convert OurAirports airports.csv + runways.csv (+ navaids.csv) into the
 * compact dataset. Large and medium airports are kept; small airports only
 * when they have a 4-letter ICAO-style code (to keep the file small).
 * The ICAO code is taken from icao_code, else a 4-letter gps_code, else ident.
 */
export function buildDataset(airportsCsv: string, runwaysCsv: string, source = 'OurAirports', navaidsCsv = ''): AirportDataset {
  const airports: AirportRow[] = [];
  const keyByIdent = new Map<string, string>();
  for (const a of table(airportsCsv)) {
    const size = SIZE[a.type];
    if (!size) continue;
    const lat = Number(a.latitude_deg);
    const lon = Number(a.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const coded = a.icao_code || (/^[A-Z]{4}$/.test(a.gps_code) ? a.gps_code : '');
    if (size === 'S' && !coded && !/^[A-Z]{4}$/.test(a.ident)) continue;
    const icao = (coded || a.ident).toUpperCase();
    keyByIdent.set(a.ident, icao);
    airports.push([icao, a.name, round(lat, 5), round(lon, 5), num(a.elevation_ft), a.iso_country ?? '', a.municipality ?? '', a.ident !== icao ? a.ident.toUpperCase() : '', size, a.scheduled_service === 'yes' ? 1 : 0]);
  }
  const runways: Record<string, RunwayRow[]> = {};
  for (const r of table(runwaysCsv)) {
    if (r.closed === '1') continue;
    const key = keyByIdent.get(r.airport_ident);
    if (!key) continue;
    const list = (runways[key] ??= []);
    const len = num(r.length_ft);
    const hdg = (v: string) => (num(v) === null ? null : round(num(v)!, 1));
    if (r.le_ident) list.push([r.le_ident.toUpperCase(), len, hdg(r.le_heading_degT), r.surface ?? '']);
    if (r.he_ident) list.push([r.he_ident.toUpperCase(), len, hdg(r.he_heading_degT), r.surface ?? '']);
  }
  const navaids: NavaidRow[] = [];
  for (const n of navaidsCsv ? table(navaidsCsv) : []) {
    if (!NAVAID_TYPES.has(n.type)) continue;
    const lat = Number(n.latitude_deg);
    const lon = Number(n.longitude_deg);
    if (!n.ident || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    navaids.push([n.ident.toUpperCase(), n.name, n.type, round(lat, 5), round(lon, 5), (n.usageType ?? '').toUpperCase(), (n.iso_country ?? '').toUpperCase(), 'o']);
  }
  return { importedAt: new Date().toISOString(), source, airports, runways, navaids };
}

/** In-memory lookup over the dataset and your custom airports. */
export class AirportIndex {
  private byIcao = new Map<string, Airport>();
  private custom = new Map<string, Airport>();
  private navaidsByIdent = new Map<string, Navaid[]>();
  readonly navaids: Navaid[] = [];
  readonly count: number;

  constructor(dataset: AirportDataset | null, custom: Airport[]) {
    for (const row of dataset?.airports ?? []) {
      const [icao, name, lat, lon, elevationFt, country, city, alias, size, scheduled] = row;
      const runways = (dataset!.runways[icao] ?? []).map(([ident, lengthFt, headingDeg, surface]) => ({ ident, lengthFt, headingDeg, surface }));
      const apt: Airport = { icao, name, lat, lon, elevationFt, runways, country, city, size: size ? SIZE_NAME[size] : undefined, scheduled: scheduled === undefined ? undefined : scheduled === 1, source: 'ourairports' };
      this.byIcao.set(icao, apt);
      if (alias && !this.byIcao.has(alias)) this.byIcao.set(alias, apt);
    }
    for (const a of custom) this.custom.set(a.icao.toUpperCase(), { ...a, source: 'custom' });
    for (const [ident, name, type, lat, lon, usage, country, src] of dataset?.navaids ?? []) {
      const n: Navaid = { ident, name, type, lat, lon, usage, country: country ?? '', source: src === 'a' ? 'openaip' : 'ourairports' };
      this.navaids.push(n);
      const list = this.navaidsByIdent.get(ident);
      if (list) list.push(n);
      else this.navaidsByIdent.set(ident, [n]);
    }
    this.count = dataset?.airports.length ?? 0;
  }

  get(icao: string): Airport | null {
    const k = icao.trim().toUpperCase();
    return this.custom.get(k) ?? this.byIcao.get(k) ?? null;
  }

  /** All airports (custom first), each once. */
  all(): Airport[] {
    const out = [...this.custom.values()];
    const seen = new Set(this.custom.keys());
    for (const [k, a] of this.byIcao) if (k === a.icao && !seen.has(k)) out.push(a);
    return out;
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
    // ICAO prefix matches first (big airports before small), then names and cities.
    const rank = (a: Airport) => (a.source === 'custom' ? 0 : a.size === 'large' ? 1 : a.size === 'medium' ? 2 : 3);
    const all = [...this.custom.values(), ...this.byIcao.values()];
    all.filter((a) => a.icao.startsWith(query)).sort((a, b) => rank(a) - rank(b)).forEach(push);
    if (out.length < limit) {
      all
        .filter((a) => a.name.toUpperCase().includes(query) || (a.city ?? '').toUpperCase().includes(query))
        .sort((a, b) => rank(a) - rank(b))
        .forEach(push);
    }
    return out;
  }

  /** Airports within `maxNm` of a point, nearest first. */
  nearby(p: LatLon, maxNm: number, filter: (a: Airport) => boolean = () => true): { airport: Airport; distanceNm: number }[] {
    const latSpan = maxNm / 60;
    return this.all()
      .filter((a) => Math.abs(a.lat - p.lat) <= latSpan && filter(a))
      .map((a) => ({ airport: a, distanceNm: distanceNm(p, a) }))
      .filter((x) => x.distanceNm <= maxNm)
      .sort((a, b) => a.distanceNm - b.distanceNm);
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

  /** VOR/NDB beacons from OurAirports, by ident (idents repeat worldwide). */
  navaidProvider(): NavDataProvider {
    return {
      id: 'navaids',
      name: 'Navaids (OurAirports)',
      findFix: (ident) =>
        (this.navaidsByIdent.get(ident) ?? []).map((n) => ({
          ident: n.ident,
          name: `${n.name} ${n.type}${n.country ? ', ' + n.country : ''}`,
          lat: n.lat,
          lon: n.lon,
          type: n.type.startsWith('NDB') ? 'ndb' : 'vor',
          source: n.source === 'openaip' ? 'Navaids (openAIP)' : 'Navaids (OurAirports)',
        })),
    };
  }
}

// openAIP navaid type codes (openAIP v2 schema).
const OPENAIP_TYPES: Record<number, string> = { 1: 'TACAN', 2: 'NDB', 3: 'VOR', 4: 'VOR-DME', 5: 'VORTAC', 6: 'VOR', 7: 'VOR-DME', 8: 'VORTAC' };

/**
 * Read an openAIP navaid export (their JSON array, or GeoJSON). Returns
 * NavaidRows; unknown shapes or types are skipped. openAIP data is licensed
 * CC BY-NC 4.0 (https://www.openaip.net).
 */
export function parseOpenAipNavaids(json: unknown, fallbackCountry = ''): NavaidRow[] {
  const items: Record<string, unknown>[] = Array.isArray(json)
    ? (json as Record<string, unknown>[])
    : json && typeof json === 'object' && Array.isArray((json as { features?: unknown }).features)
      ? ((json as { features: { properties?: Record<string, unknown>; geometry?: unknown }[] }).features.map((f) => ({ ...f.properties, geometry: f.geometry })))
      : [];
  const rows: NavaidRow[] = [];
  for (const it of items) {
    const type = OPENAIP_TYPES[Number(it.type)];
    const coords = (it.geometry as { coordinates?: unknown } | undefined)?.coordinates;
    const ident = typeof it.identifier === 'string' ? it.identifier.trim().toUpperCase() : '';
    if (!type || !ident || !Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const country = (typeof it.country === 'string' ? it.country : fallbackCountry).toUpperCase();
    rows.push([ident, typeof it.name === 'string' ? it.name : ident, type, round(lat, 5), round(lon, 5), '', country, 'a']);
  }
  return rows;
}

/** Add beacons that aren't already there (same ident within 10 nm counts as the same). */
export function mergeNavaids(base: NavaidRow[], extra: NavaidRow[]): { merged: NavaidRow[]; added: number } {
  const byIdent = new Map<string, NavaidRow[]>();
  for (const n of base) byIdent.set(n[0], [...(byIdent.get(n[0]) ?? []), n]);
  const merged = [...base];
  let added = 0;
  for (const n of extra) {
    const same = (byIdent.get(n[0]) ?? []).some((b) => distanceNm({ lat: b[3], lon: b[4] }, { lat: n[3], lon: n[4] }) < 10);
    if (same) continue;
    merged.push(n);
    byIdent.set(n[0], [...(byIdent.get(n[0]) ?? []), n]);
    added++;
  }
  return { merged, added };
}

/** Public openAIP export bucket (daily per-country files). */
export const OPENAIP_EXPORT = 'https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f';

/** Where the GitHub Action downloads from (see scripts/build-airport-data.ts). */
export const OURAIRPORTS_URLS = {
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  runways: 'https://davidmegginson.github.io/ourairports-data/runways.csv',
  navaids: 'https://davidmegginson.github.io/ourairports-data/navaids.csv',
};
