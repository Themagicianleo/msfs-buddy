// Route string parser: "ZBAA SID WPT1 W5 WPT2 STAR RJTT".
//
// Every point is resolved through the navdata providers. Without airway
// data, an airway segment is flown as a direct great-circle leg between its
// entry and exit fixes, and SIDs/STARs are not drawn at all (the leg runs
// direct from the airport). Both are listed in the warnings because the
// real track is longer.

import { distanceNm, initialCourseTrue, parseCoordinate, type LatLon } from './geo';
import { expandAirway, findFix, type NavDataProvider, type NavFix } from './navdata';

export type TokenKind = 'airport' | 'fix' | 'coord' | 'airway' | 'sid' | 'star' | 'direct' | 'speedlevel' | 'unknown';

export interface RouteToken {
  raw: string;
  kind: TokenKind;
  fix?: NavFix;
  note?: string;
}

export interface RoutePoint extends LatLon {
  ident: string;
  name?: string;
  type: NavFix['type'] | 'coord';
  source: string;
  via: string; // how this point is reached from the previous one
}

export interface Leg {
  from: RoutePoint;
  to: RoutePoint;
  via: string;
  distanceNm: number;
  courseTrue: number;
}

export interface ParsedRoute {
  tokens: RouteToken[];
  points: RoutePoint[];
  legs: Leg[];
  totalNm: number;
  warnings: string[];
  /** Route without departure/arrival airports, for typing into the FMC. */
  fmcRoute: string;
}

const AIRWAY = /^[A-Z]{1,2}\d{1,4}[A-Z]?$/;
// SID/STAR names such as ELKUR1A, MID2G: letters, a digit, then a letter.
const PROCEDURE = /^[A-Z]{2,6}\d[A-Z]$/;
const SPEED_LEVEL = /^[NKM]\d{3,4}[FASM]\d{3,4}$/;

function nearest(cands: NavFix[], ref: LatLon | null): NavFix {
  if (!ref || cands.length === 1) return cands[0];
  return [...cands].sort((a, b) => distanceNm(ref, a) - distanceNm(ref, b))[0];
}

function toPoint(f: NavFix, via: string): RoutePoint {
  return { ident: f.ident, name: f.name, lat: f.lat, lon: f.lon, type: f.type, source: f.source, via };
}

export function parseRoute(text: string, providers: NavDataProvider[], dep?: NavFix | null, arr?: NavFix | null): ParsedRoute {
  const raw = text.toUpperCase().split(/\s+/).filter(Boolean);
  const tokens: RouteToken[] = [];
  const warnings: string[] = [];

  // Drop departure/arrival (optionally with /runway) from the ends; they are
  // set by the dedicated fields.
  const strip = (t: string | undefined, apt: NavFix | null | undefined) => !!t && !!apt && t.split('/')[0] === apt.ident;
  if (strip(raw[0], dep)) tokens.push({ raw: raw.shift()!, kind: 'airport', fix: dep! });
  const tail: RouteToken[] = [];
  if (strip(raw[raw.length - 1], arr)) tail.push({ raw: raw.pop()!, kind: 'airport', fix: arr! });

  let ref: LatLon | null = dep ?? null;
  for (const t of raw) {
    if (t === 'DCT') {
      tokens.push({ raw: t, kind: 'direct' });
      continue;
    }
    if (SPEED_LEVEL.test(t)) {
      tokens.push({ raw: t, kind: 'speedlevel', note: 'Speed/level group ignored' });
      continue;
    }
    if (t === 'SID' || t === 'STAR') {
      tokens.push({ raw: t, kind: t === 'SID' ? 'sid' : 'star' });
      continue;
    }
    const coord = parseCoordinate(t);
    if (coord) {
      const fix: NavFix = { ident: t, ...coord, type: 'user', source: 'Coordinates' };
      tokens.push({ raw: t, kind: 'coord', fix });
      ref = coord;
      continue;
    }
    const cands = findFix(providers, t);
    if (cands.length) {
      const fix = nearest(cands, ref);
      tokens.push({ raw: t, kind: fix.type === 'airport' ? 'airport' : 'fix', fix, note: cands.length > 1 ? `${cands.length} matches, nearest used` : undefined });
      ref = fix;
      continue;
    }
    if (AIRWAY.test(t)) {
      tokens.push({ raw: t, kind: 'airway' });
      continue;
    }
    if (PROCEDURE.test(t)) {
      tokens.push({ raw: t, kind: 'sid' }); // SID or STAR decided below
      continue;
    }
    tokens.push({ raw: t, kind: 'unknown', note: 'Not found. Add it under Waypoints or write it as coordinates.' });
  }
  tokens.push(...tail);

  // Named procedures: before the first enroute fix it's a SID, after the last
  // a STAR. With no enroute fixes, the first is the SID and any later one the STAR.
  const enroute = tokens.map((tk, i) => (tk.fix && tk.fix !== dep && tk.fix !== arr ? i : -1)).filter((i) => i >= 0);
  let seenProc = false;
  tokens.forEach((tk, i) => {
    if (tk.kind !== 'sid' || tk.raw === 'SID') return;
    if (!enroute.length) tk.kind = seenProc ? 'star' : 'sid';
    else if (i > enroute[enroute.length - 1]) tk.kind = 'star';
    else if (i > enroute[0]) Object.assign(tk, { kind: 'unknown', note: 'Looks like a procedure but sits mid-route. Add it as a waypoint if it is one.' });
    seenProc = true;
  });

  // Build points and legs.
  const points: RoutePoint[] = [];
  if (dep) points.push(toPoint(dep, ''));
  let via = 'DCT';
  let airwayFrom: string | null = null;
  let anyAirway = false;
  let anyProc = false;
  for (const tk of tokens) {
    if (tk.kind === 'airport' && (tk.fix === dep || tk.fix === arr)) continue;
    if (tk.kind === 'direct') via = 'DCT';
    else if (tk.kind === 'airway') {
      via = tk.raw;
      airwayFrom = points[points.length - 1]?.ident ?? null;
    } else if (tk.kind === 'sid' || tk.kind === 'star') {
      via = tk.raw;
      anyProc = true;
    } else if (tk.fix) {
      if (airwayFrom && via !== 'DCT' && AIRWAY.test(via)) {
        const inner = expandAirway(providers, via, airwayFrom, tk.fix.ident);
        if (inner) inner.forEach((f) => points.push(toPoint(f, via)));
        else anyAirway = true;
      }
      points.push(toPoint(tk.fix, via));
      via = 'DCT';
      airwayFrom = null;
    }
  }
  if (arr) points.push(toPoint(arr, via));

  const legs: Leg[] = [];
  for (let i = 1; i < points.length; i++) {
    legs.push({
      from: points[i - 1],
      to: points[i],
      via: points[i].via || 'DCT',
      distanceNm: distanceNm(points[i - 1], points[i]),
      courseTrue: initialCourseTrue(points[i - 1], points[i]),
    });
  }

  const unknown = tokens.filter((t) => t.kind === 'unknown').map((t) => t.raw);
  if (unknown.length) warnings.push(`Not found, so left out of the distance: ${unknown.join(', ')}.`);
  if (anyAirway) warnings.push('Airway segments are flown direct between their entry and exit fixes (no airway data). The real track is usually longer.');
  const procs = tokens.filter((t) => (t.kind === 'sid' || t.kind === 'star') && t.raw !== 'SID' && t.raw !== 'STAR');
  if (procs.length) warnings.push(`Read as procedures (not waypoints): ${procs.map((t) => `${t.raw} = ${t.kind.toUpperCase()}`).join(', ')}.`);
  if (anyProc) warnings.push('SIDs and STARs are not modelled; those legs run direct from/to the airport. Add your own allowance (Extra fuel).');
  if (tokens.some((t) => t.kind === 'speedlevel')) warnings.push('Speed/level groups (e.g. N0450F350) are ignored.');
  if (!dep || !arr) warnings.push('Departure and arrival airports must be found before the distance is complete.');

  const fmcRoute = tokens
    .filter((t) => !(t.kind === 'airport' && (t.fix === dep || t.fix === arr)) && t.kind !== 'speedlevel')
    .map((t) => t.raw)
    .join(' ');

  return { tokens, points, legs, totalNm: legs.reduce((a, l) => a + l.distanceNm, 0), warnings, fmcRoute };
}
