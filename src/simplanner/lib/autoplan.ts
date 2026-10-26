// Automatic planning helpers used by "Generate flight": a VOR-to-VOR route,
// a cruise level, an alternate and runways. None of this uses airway or
// procedure data (SimPlanner has none), so the route follows radio beacons
// near the great-circle track, like the "VOR to VOR" option in MSFS's own
// planner. It is flyable in the FMC but it is not an ATC airway route.

import { distanceNm, EARTH_RADIUS_NM, initialCourseTrue, type LatLon } from './geo';
import type { Airport, AirportIndex, Navaid, Runway } from './airports';

export type RouteMode = 'navaids' | 'direct' | 'manual';

export interface RouteOptions {
  /** Shortest leg between beacons. */
  minLegNm: number;
  /** Longest leg before looking for the next beacon. */
  maxLegNm: number;
  /** How far either side of the great circle a beacon may be. */
  corridorNm: number;
  /** Ignore beacons this close to either airport (SID/STAR territory). */
  terminalNm: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { minLegNm: 60, maxLegNm: 220, corridorNm: 50, terminalNm: 30 };

export interface GeneratedRoute {
  route: string;
  navaids: Navaid[];
  directNm: number;
  routeNm: number;
  note: string;
}

const R = EARTH_RADIUS_NM;
const rad = (d: number) => (d * Math.PI) / 180;

/** Cross-track and along-track distance (nm) of p from the great circle a→b. */
export function trackPosition(a: LatLon, b: LatLon, p: LatLon): { crossNm: number; alongNm: number } {
  const d13 = distanceNm(a, p) / R;
  const t13 = rad(initialCourseTrue(a, p));
  const t12 = rad(initialCourseTrue(a, b));
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(t13 - t12))));
  const cosAt = Math.cos(d13) / Math.cos(xt);
  let at = Math.acos(Math.max(-1, Math.min(1, cosAt)));
  if (Math.cos(t13 - t12) < 0) at = -at;
  return { crossNm: xt * R, alongNm: at * R };
}

/**
 * Penalty (in nm of "badness"): NDBs are only a fallback when no VOR is in
 * reach, and low-level/terminal aids rank below high-altitude ones.
 */
function penalty(n: Navaid): number {
  let p = n.type.startsWith('NDB') ? 150 : 0;
  if (n.usage === 'LO' || n.usage === 'TERMINAL') p += 30;
  return p;
}

export function generateRoute(dep: LatLon, arr: LatLon, navaids: Navaid[], mode: RouteMode, opts: RouteOptions = DEFAULT_ROUTE_OPTIONS): GeneratedRoute {
  const directNm = distanceNm(dep, arr);
  if (mode === 'direct') return { route: 'DCT', navaids: [], directNm, routeNm: directNm, note: 'Direct great-circle route.' };
  if (!navaids.length) return { route: 'DCT', navaids: [], directNm, routeNm: directNm, note: 'No navaid data loaded, so the route is direct.' };
  if (directNm < opts.terminalNm * 2 + opts.minLegNm) {
    return { route: 'DCT', navaids: [], directNm, routeNm: directNm, note: 'Short flight: direct route.' };
  }

  // Cheap box filter, then exact track position.
  const minLat = Math.min(dep.lat, arr.lat) - 6;
  const maxLat = Math.max(dep.lat, arr.lat) + 6;
  const candidates = navaids
    .filter((n) => n.lat >= minLat && n.lat <= maxLat)
    .map((n) => ({ n, ...trackPosition(dep, arr, n) }))
    .filter((c) => Math.abs(c.crossNm) <= opts.corridorNm && c.alongNm >= opts.terminalNm && c.alongNm <= directNm - opts.terminalNm)
    .sort((a, b) => a.alongNm - b.alongNm);

  const picked: Navaid[] = [];
  let pos = 0;
  let guard = 0;
  while (directNm - pos > opts.maxLegNm && guard++ < 500) {
    let window = candidates.filter((c) => c.alongNm >= pos + opts.minLegNm && c.alongNm <= pos + opts.maxLegNm);
    if (!window.length) {
      // Nothing in reach (e.g. over water): fly direct to the next beacon ahead, if any.
      const next = candidates.find((c) => c.alongNm >= pos + opts.minLegNm);
      if (!next) break;
      window = candidates.filter((c) => c.alongNm >= next.alongNm && c.alongNm <= next.alongNm + opts.maxLegNm - opts.minLegNm);
    }
    // Favour progress along the track, then staying close to it.
    const best = window.reduce((a, b) => {
      const s = (c: (typeof window)[number]) => (c.alongNm - pos) - 2 * Math.abs(c.crossNm) - penalty(c.n);
      return s(b) > s(a) ? b : a;
    });
    if (picked[picked.length - 1]?.ident !== best.n.ident) picked.push(best.n);
    pos = best.alongNm;
  }

  const pts: LatLon[] = [dep, ...picked, arr];
  let routeNm = 0;
  for (let i = 1; i < pts.length; i++) routeNm += distanceNm(pts[i - 1], pts[i]);
  const route = picked.length ? picked.map((n) => n.ident).join(' DCT ') : 'DCT';
  const extra = ((routeNm / directNm - 1) * 100).toFixed(1);
  const note = picked.length
    ? `VOR-to-VOR route through ${picked.length} beacons, ${extra}% longer than direct. Not an airway route; add the SID and STAR in the FMC.`
    : 'No beacons near the track, so the route is direct.';
  return { route, navaids: picked, directNm, routeNm, note };
}

/**
 * Cruise level: climb higher on longer flights (about FL100 + 0.75 × distance,
 * capped at the profile's normal cruise level), then apply the semicircular
 * rule (eastbound odd thousands, westbound even). Uses TRUE course; the rule
 * is defined on magnetic track, so check it near 000°/180°.
 */
export function suggestCruiseFl(distance: number, courseTrue: number, maxFl: number): number {
  let fl = Math.min(maxFl, Math.max(100, 100 + distance * 0.75));
  fl = Math.floor(fl / 10) * 10;
  const eastbound = courseTrue < 180;
  const odd = (fl / 10) % 2 === 1;
  if (eastbound !== odd) fl -= 10;
  return Math.max(fl, eastbound ? 110 : 100);
}

export interface AlternateSuggestion {
  airport: Airport;
  distanceNm: number;
  longestRunwayFt: number;
}

export function longestRunway(a: Airport): number {
  return a.runways.reduce((m, r) => Math.max(m, r.lengthFt ?? 0), 0);
}

/**
 * Alternates for the arrival: airports with scheduled airline service (so no
 * military bases or private fields) and a long enough runway, in the same
 * country as the arrival first, then nearest first. Your own airports count
 * as suitable.
 */
export function suggestAlternates(index: AirportIndex, arr: Airport, minRunwayFt: number, count = 5, maxNm = 300): AlternateSuggestion[] {
  const suitable = (a: Airport) =>
    a.icao !== arr.icao && (a.source === 'custom' || ((a.size === 'large' || a.size === 'medium') && a.scheduled !== false));
  const sameCountry = (a: Airport) => !arr.country || !a.country || a.country === arr.country;
  return index
    .nearby(arr, maxNm, suitable)
    .map((x) => ({ airport: x.airport, distanceNm: x.distanceNm, longestRunwayFt: longestRunway(x.airport) }))
    .filter((x) => x.distanceNm >= 10 && x.longestRunwayFt >= minRunwayFt)
    .sort((a, b) => Number(!sameCountry(a.airport)) - Number(!sameCountry(b.airport)) || a.distanceNm - b.distanceNm)
    .slice(0, count);
}

/**
 * Runway heading: the data's heading if present, else from the runway number
 * (16 → 160°, a magnetic figure ±5°). Many OurAirports runways have no heading.
 */
function heading(r: Runway): number | null {
  if (r.headingDeg !== null) return r.headingDeg;
  const m = r.ident.match(/^(\d{1,2})[LCR]?$/);
  return m && +m[1] >= 1 && +m[1] <= 36 ? +m[1] * 10 : null;
}

export interface RunwayPick {
  runway: Runway | null;
  reason: string;
}

/**
 * Runway into the wind if the wind is known and at least 3 kt; otherwise the
 * longest. Only runways at least `minLengthFt` long are considered when any are.
 * Both METAR wind and OurAirports headings are TRUE.
 */
export function pickRunway(a: Airport, wind: { dir: number | null; speed: number } | null, minLengthFt = 0): RunwayPick {
  const all = a.runways.filter((r) => r.ident);
  if (!all.length) return { runway: null, reason: 'no runway data' };
  const long = all.filter((r) => (r.lengthFt ?? 0) >= minLengthFt);
  const pool = long.length ? long : all;
  if (wind && wind.dir !== null && wind.speed >= 3) {
    const withHdg = pool.filter((r) => heading(r) !== null);
    if (withHdg.length) {
      const head = (r: Runway) => wind.speed * Math.cos(rad(wind.dir! - heading(r)!));
      const best = withHdg.reduce((x, y) => (head(y) > head(x) + 0.5 || (Math.abs(head(y) - head(x)) <= 0.5 && (y.lengthFt ?? 0) > (x.lengthFt ?? 0)) ? y : x));
      const approx = best.headingDeg === null ? ', heading taken from the runway number' : '';
      return { runway: best, reason: `into the wind (${String(wind.dir).padStart(3, '0')}/${wind.speed} kt, headwind ${Math.round(head(best))} kt${approx})` };
    }
  }
  const longest = pool.reduce((x, y) => ((y.lengthFt ?? 0) > (x.lengthFt ?? 0) ? y : x));
  return { runway: longest, reason: wind ? 'longest (calm or variable wind)' : 'longest (no current wind)' };
}
