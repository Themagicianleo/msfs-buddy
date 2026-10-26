// Navigation data lookup. SimPlanner ships NO licensed navdata (no AIRAC,
// no Navigraph). Fixes come from providers: your own custom waypoints, the
// airport list, and any provider you add later (see README, "Plugging in
// your own navdata").

import type { LatLon } from './geo';

export type FixType = 'airport' | 'waypoint' | 'vor' | 'ndb' | 'user';

export interface NavFix extends LatLon {
  ident: string;
  name?: string;
  type: FixType;
  source: string; // which provider found it, shown in the route preview
}

export interface NavDataProvider {
  id: string;
  name: string;
  /** All fixes with this identifier (idents repeat around the world). */
  findFix(ident: string): NavFix[];
  /**
   * Optional: the fixes along an airway between two fixes (exclusive).
   * Return null when the provider has no airway data; the leg is then
   * flown direct and flagged in the route warnings.
   */
  expandAirway?(airway: string, fromIdent: string, toIdent: string): NavFix[] | null;
}

/** Look a fix up across providers in order; earlier providers win. */
export function findFix(providers: NavDataProvider[], ident: string): NavFix[] {
  for (const p of providers) {
    const found = p.findFix(ident);
    if (found.length) return found;
  }
  return [];
}

export function expandAirway(providers: NavDataProvider[], airway: string, from: string, to: string): NavFix[] | null {
  for (const p of providers) {
    const fixes = p.expandAirway?.(airway, from, to);
    if (fixes) return fixes;
  }
  return null;
}

export interface CustomWaypoint extends LatLon {
  ident: string;
  name?: string;
  type?: FixType;
}

export function customWaypointProvider(waypoints: CustomWaypoint[]): NavDataProvider {
  return {
    id: 'custom',
    name: 'My waypoints',
    findFix: (ident) =>
      waypoints
        .filter((w) => w.ident.toUpperCase() === ident)
        .map((w) => ({ ident: w.ident.toUpperCase(), lat: w.lat, lon: w.lon, name: w.name, type: w.type ?? 'user', source: 'My waypoints' })),
  };
}

/**
 * Parse "IDENT,LAT,LON[,NAME]" lines (CSV, comma or semicolon). Lets you
 * paste waypoints exported from your own sources. Returns the waypoints and
 * any lines that could not be read.
 */
export function parseWaypointCsv(text: string): { waypoints: CustomWaypoint[]; errors: string[] } {
  const waypoints: CustomWaypoint[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith('#') || /^ident\b/i.test(l)) return;
    const [ident, lat, lon, ...rest] = l.split(/[;,\t]/).map((x) => x.trim());
    const p = { lat: Number(lat), lon: Number(lon) };
    if (!ident || !/^[A-Z0-9]{1,12}$/i.test(ident) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      errors.push(`Line ${i + 1}: "${l}"`);
      return;
    }
    waypoints.push({ ident: ident.toUpperCase(), lat: p.lat, lon: p.lon, name: rest.join(' ') || undefined });
  });
  return { waypoints, errors };
}
