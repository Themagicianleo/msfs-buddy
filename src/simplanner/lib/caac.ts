// Published route lists from CAAC (Civil Aviation Administration of China):
// the "International Flights from / to Mainland of China" and "Regional
// Flight Routes" CSV files, one set per AIRAC cycle. They are CAAC
// publications, so SimPlanner never ships them: you import your own copy and
// it is kept in this browser only (IndexedDB).
//
// Each row is a route code, the airports it serves, and a route string of
// fixes and airways ("GURET W233 AGULU ... AGAVO"). International routes
// cover only the part inside China: they end (or start) at the point where
// the flight leaves (or enters) Chinese airspace. The files have no
// coordinates, so 5-letter fixes only resolve if you add them as waypoints.

import { parseCsv } from './airports';

export type PublishedKind = 'from' | 'to' | 'regional';

export interface PublishedRoute {
  code: string;
  kind: PublishedKind;
  /** Departure airport, or the entry point for routes into China. */
  from: string;
  /** Arrival airport, or the exit point for routes out of China. */
  to: string;
  /** The foreign airports the route serves (international lists only). */
  airports: string[];
  route: string;
}

export interface RouteList {
  kind: PublishedKind;
  /** AIRAC cycle number in the file, e.g. "2610". */
  cycle: string;
  /** Effective date (YYYY-MM-DD) from the file's title line. */
  effective: string;
  routes: PublishedRoute[];
}

export interface RouteLibrary {
  importedAt: string;
  lists: RouteList[];
}

export const ROUTE_LIBRARY_KEY = 'caacRoutes';

const KIND_LABEL: Record<PublishedKind, string> = {
  from: 'International flights from mainland China',
  to: 'International flights to mainland China',
  regional: 'Regional flights (Hong Kong, Macau, Taiwan)',
};

export const kindLabel = (k: PublishedKind) => KIND_LABEL[k];

const ICAO = /^[A-Z]{4}$/;
const ROUTE_TEXT = /^[A-Z0-9 ]+$/;

/** Read one CAAC CSV. Throws with a readable message if it isn't one. */
export function parseCaacRoutes(text: string): RouteList {
  const rows = parseCsv(text.replace(/^﻿/, '')).map((r) => r.map((f) => f.replace(/ /g, ' ').trim()));
  const title = rows[0]?.[0] ?? '';
  const head = (rows[1] ?? []).map((h) => h.toLowerCase());
  if (head[0] !== 'route code' || !head.includes('fly along')) throw new Error('This is not a CAAC flight route list (expected "Route Code" and "Fly along" columns).');
  if (/overfl/i.test(title)) throw new Error('Overflight routes link border points, not airports, so SimPlanner does not use them.');
  const kind: PublishedKind | null = head.includes('destination ad') ? 'from' : head.includes('departure ad') ? 'to' : /regional/i.test(title) ? 'regional' : null;
  if (!kind) throw new Error('Unrecognised CAAC route list. Import the International (from / to mainland) or Regional files.');

  const cycle = title.match(/Nr\s*(\d{4})/i)?.[1] ?? '';
  const eff = title.match(/EFF\s*(\d{4})(\d{2})(\d{2})/i);
  const effective = eff ? `${eff[1]}-${eff[2]}-${eff[3]}` : '';
  const along = head.indexOf('fly along');
  const apts = head.findIndex((h) => h === 'destination ad' || h === 'departure ad');

  const routes: PublishedRoute[] = [];
  for (const r of rows.slice(2)) {
    const code = (r[0] ?? '').toUpperCase();
    const route = (r[along] ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    const parts = code.split('-');
    if (parts.length < 3 || !route || !ROUTE_TEXT.test(route)) continue;
    const [from, to] = parts;
    const airports = apts >= 0 ? (r[apts] ?? '').toUpperCase().split(/\s+/).filter((a) => ICAO.test(a)) : [];
    if (kind === 'regional' ? !ICAO.test(from) || !ICAO.test(to) : !airports.length) continue;
    routes.push({ code, kind, from, to, airports, route });
  }
  if (!routes.length) throw new Error('No routes found in that file.');
  return { kind, cycle, effective, routes };
}

/** Add lists to a library; a new list replaces the old one of the same kind. */
export function addLists(lib: RouteLibrary | null, lists: RouteList[], now = new Date()): RouteLibrary {
  const kept = (lib?.lists ?? []).filter((l) => !lists.some((n) => n.kind === l.kind));
  return { importedAt: now.toISOString(), lists: [...kept, ...lists] };
}

/** Published routes for this airport pair, in file order (01 before 02). */
export function findPublishedRoutes(lib: RouteLibrary | null | undefined, dep: string, arr: string): PublishedRoute[] {
  if (!lib || !dep || !arr) return [];
  const d = dep.toUpperCase();
  const a = arr.toUpperCase();
  return lib.lists.flatMap((l) =>
    l.routes.filter((r) =>
      r.kind === 'regional' ? r.from === d && r.to === a : r.kind === 'from' ? r.from === d && r.airports.includes(a) : r.to === a && r.airports.includes(d),
    ),
  );
}

/** One line for the OFP explaining what the published route covers. */
export function describePublished(r: PublishedRoute, cycle: string, dep: string, arr: string): string {
  const src = `CAAC published route ${r.code}${cycle ? ` (cycle ${cycle})` : ''}`;
  if (r.kind === 'from') return `${src}. It ends at ${r.to}, where the flight leaves Chinese airspace: add the rest of the route to ${arr} yourself (it is flown direct here).`;
  if (r.kind === 'to') return `${src}. It starts at ${r.from}, where the flight enters Chinese airspace: add the route from ${dep} to it yourself (it is flown direct here).`;
  return `${src}.`;
}
