// Terrain and geography around an airport, for situational awareness only.
//
// - Ground height: Copernicus 90 m DEM through Open-Meteo's free elevation
//   API (https://open-meteo.com/en/docs/elevation-api), sampled on rings
//   around the airport and along the approach. Samples are 10° and 2.5 nm
//   apart, so a narrow peak between them can be missed; named summits from
//   OpenStreetMap are added to cover that.
// - Named features (summits, passes, lakes, towns): OpenStreetMap through
//   the Overpass API, © OpenStreetMap contributors (ODbL).
// Neither includes obstacles (masts, buildings) and nothing here replaces
// the MSA, minimums and terrain warnings on your charts.

export interface LatLon {
  lat: number;
  lon: number;
}

const R_NM = 3440.065;
const FT_PER_M = 3.28084;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const mToFt = (m: number) => m * FT_PER_M;

export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `nm` away from `p` on true bearing `brg`. */
export function destination(p: LatLon, brg: number, nm: number): LatLon {
  const d = nm / R_NM;
  const lat1 = rad(p.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rad(brg)));
  const lon2 = rad(p.lon) + Math.atan2(Math.sin(rad(brg)) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (brg: number) => COMPASS[Math.round(brg / 45) % 8];

// ---------- Sampling plan ----------

export const RADIUS_NM = 25;
export const RING_STEP_NM = 2.5;
export const BEARING_STEP = 10;
export const APPROACH_NM = 15;

/** Ring samples around the airport: every 10°, every 2.5 nm out to 25 nm. */
export function ringSamples(center: LatLon): { ring: number; brg: number; p: LatLon }[] {
  const out: { ring: number; brg: number; p: LatLon }[] = [];
  for (let r = RING_STEP_NM; r <= RADIUS_NM + 1e-9; r += RING_STEP_NM)
    for (let b = 0; b < 360; b += BEARING_STEP) out.push({ ring: r, brg: b, p: destination(center, b, r) });
  return out;
}

/**
 * Runway direction from its designator ("24R" -> 240°). Magnetic, used as
 * true: off by the local magnetic variation (a few degrees in most places).
 */
export function runwayHeading(ident: string): number | null {
  const m = ident.trim().match(/^(\d{1,2})[LCR]?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 36 ? (n * 10) % 360 : null;
}

/** Points on the final approach to a runway, 0 (the field) to 15 nm out, 1 nm apart. */
export function approachSamples(field: LatLon, runwayHdg: number): { nm: number; p: LatLon }[] {
  const out: { nm: number; p: LatLon }[] = [];
  for (let nm = 0; nm <= APPROACH_NM; nm++) out.push({ nm, p: destination(field, (runwayHdg + 180) % 360, nm) });
  return out;
}

// ---------- Fetching ----------

const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

/** Ground height in metres for each point (Open-Meteo takes up to 100 per request). */
export async function fetchElevations(points: LatLon[], fetchFn: typeof fetch = fetch): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const q = (k: 'lat' | 'lon') => chunk.map((p) => p[k].toFixed(5)).join(',');
    const res = await fetchFn(`${ELEVATION_API}?latitude=${q('lat')}&longitude=${q('lon')}`);
    if (!res.ok) throw new Error(`Elevation service error (HTTP ${res.status})`);
    const body = (await res.json()) as { elevation?: unknown };
    if (!Array.isArray(body.elevation) || body.elevation.length !== chunk.length) throw new Error('Unexpected answer from the elevation service.');
    out.push(...body.elevation.map((e) => (typeof e === 'number' && Number.isFinite(e) ? e : 0)));
  }
  return out;
}

export type FeatureKind = 'peak' | 'volcano' | 'pass' | 'water' | 'town';

export interface GeoFeature {
  kind: FeatureKind;
  name: string;
  lat: number;
  lon: number;
  /** Height in metres, when OpenStreetMap has one. */
  eleM: number | null;
  distNm: number;
  brg: number;
}

/** "5,890 m", "4500", "15000 ft" -> metres; null if unreadable. */
export function parseEle(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.replace(/,/g, '').match(/^\s*(-?\d+(?:\.\d+)?)\s*(m|ft|feet)?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^f/i.test(m[2] ?? '') ? n / FT_PER_M : n;
}

export function overpassQuery(c: LatLon, radiusNm = RADIUS_NM): string {
  const r = Math.round(radiusNm * 1852);
  const at = `(around:${r},${c.lat.toFixed(5)},${c.lon.toFixed(5)})`;
  return `[out:json][timeout:25];(
node${at}["natural"~"^(peak|volcano)$"];
node${at}["mountain_pass"="yes"]["name"];
node${at}["natural"="saddle"]["name"];
nwr${at}["natural"="water"]["name"];
node${at}["place"~"^(city|town)$"]["name"];
);out center tags 400;`;
}

interface OsmElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** OpenStreetMap elements -> features with distance and bearing from the airport. */
export function parseFeatures(json: unknown, c: LatLon): GeoFeature[] {
  const elements = (json as { elements?: OsmElement[] })?.elements;
  if (!Array.isArray(elements)) return [];
  const out: GeoFeature[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const pos = e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : e.center;
    if (!pos) continue;
    const name = (t['name:en'] || t.name || '').trim();
    const eleM = parseEle(t.ele);
    let kind: FeatureKind | null = null;
    if (t.natural === 'peak') kind = 'peak';
    else if (t.natural === 'volcano') kind = 'volcano';
    else if (t.mountain_pass === 'yes' || t.natural === 'saddle') kind = 'pass';
    else if (t.natural === 'water') kind = 'water';
    else if (t.place === 'city' || t.place === 'town') kind = 'town';
    if (!kind || (!name && eleM === null)) continue;
    out.push({ kind, name: name || 'Unnamed summit', lat: pos.lat, lon: pos.lon, eleM, distNm: distanceNm(c, pos), brg: bearingDeg(c, pos) });
  }
  return out;
}

export async function fetchFeatures(c: LatLon, fetchFn: typeof fetch = fetch): Promise<GeoFeature[]> {
  const res = await fetchFn(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(overpassQuery(c))}`,
  });
  if (!res.ok) throw new Error(`OpenStreetMap (Overpass) error (HTTP ${res.status}); it is often busy, try again in a minute.`);
  return parseFeatures(await res.json(), c);
}

// ---------- Analysis ----------

export interface TerrainPoint {
  elevFt: number;
  distNm: number;
  brg: number;
  /** A named summit from OpenStreetMap, when that is the highest point. */
  name?: string;
}

export interface TerrainData {
  v: 1;
  icao: string;
  fetchedAt: string;
  center: LatLon;
  fieldElevFt: number;
  /** Ground height (ft) per ring (2.5 … 25 nm) and bearing (0, 10 … 350). */
  grid: number[][];
  runway: string;
  runwayHdg: number | null;
  /** Ground height (ft) on the approach, index = nm from the field. */
  approach: number[];
  features: GeoFeature[];
  featuresError?: string;
}

export interface TerrainSummary {
  within10: TerrainPoint;
  within25: TerrainPoint;
  /** Highest terrain per quadrant (N = 315–045 …) within 25 nm, and that + 1,000 ft rounded up to 100 ft. */
  quadrants: { name: string; highest: TerrainPoint; plus1000: number }[];
  /** Least clearance between the 3° glide path and the ground, 3 to 15 nm out (closer in, any path is near the ground). */
  approach: { minClearanceFt: number; atNm: number } | null;
  /** Summits higher than the field, highest first. */
  peaks: GeoFeature[];
}

const ringIndexNm = (i: number) => (i + 1) * RING_STEP_NM;

function highest(d: TerrainData, maxNm: number, inSector: (brg: number) => boolean = () => true): TerrainPoint {
  let best: TerrainPoint = { elevFt: d.fieldElevFt, distNm: 0, brg: 0 };
  d.grid.forEach((row, ri) => {
    if (ringIndexNm(ri) > maxNm + 1e-9) return;
    row.forEach((ft, bi) => {
      const brg = bi * BEARING_STEP;
      if (inSector(brg) && ft > best.elevFt) best = { elevFt: ft, distNm: ringIndexNm(ri), brg };
    });
  });
  for (const f of d.features) {
    if ((f.kind !== 'peak' && f.kind !== 'volcano') || f.eleM === null || f.distNm > maxNm || !inSector(f.brg)) continue;
    const ft = mToFt(f.eleM);
    if (ft > best.elevFt) best = { elevFt: ft, distNm: f.distNm, brg: f.brg, name: f.name };
  }
  return best;
}

/** Glide path height above the field at `nm` out: 3° ≈ 318 ft per nm. */
export const glidePathFt = (nm: number) => nm * 1852 * Math.tan(rad(3)) * FT_PER_M;

export function summarize(d: TerrainData): TerrainSummary {
  const quad = (name: string, from: number) => {
    const inQ = (b: number) => ((b - from + 360) % 360) < 90;
    const h = highest(d, RADIUS_NM, inQ);
    return { name, highest: h, plus1000: Math.ceil((h.elevFt + 1000) / 100) * 100 };
  };
  let approach: TerrainSummary['approach'] = null;
  d.approach.forEach((ft, nm) => {
    if (nm < 3) return;
    const clearance = d.fieldElevFt + glidePathFt(nm) - ft;
    if (!approach || clearance < approach.minClearanceFt) approach = { minClearanceFt: clearance, atNm: nm };
  });
  return {
    within10: highest(d, 10),
    within25: highest(d, RADIUS_NM),
    quadrants: [quad('North', 315), quad('East', 45), quad('South', 135), quad('West', 225)],
    approach,
    peaks: d.features
      .filter((f) => (f.kind === 'peak' || f.kind === 'volcano') && f.eleM !== null && mToFt(f.eleM) > d.fieldElevFt)
      .sort((a, b) => b.eleM! - a.eleM!),
  };
}

/** Fetch everything for one airport. Features are optional: if OpenStreetMap is busy the terrain still shows. */
export async function loadTerrain(
  a: { icao: string; lat: number; lon: number; elevation: number | null; runway: string },
  fetchFn: typeof fetch = fetch,
  now = new Date(),
): Promise<TerrainData> {
  const center = { lat: a.lat, lon: a.lon };
  const rings = ringSamples(center);
  const runwayHdg = runwayHeading(a.runway);
  const appr = runwayHdg === null ? [] : approachSamples(center, runwayHdg);
  const [heights, features] = await Promise.all([
    fetchElevations([center, ...rings.map((r) => r.p), ...appr.map((x) => x.p)], fetchFn),
    fetchFeatures(center, fetchFn).then(
      (f) => ({ f, err: undefined as string | undefined }),
      (e: Error) => ({ f: [] as GeoFeature[], err: e.message }),
    ),
  ]);
  const ft = heights.map(mToFt);
  const perRing = 360 / BEARING_STEP;
  const grid: number[][] = [];
  for (let i = 0; i < rings.length; i += perRing) grid.push(ft.slice(1 + i, 1 + i + perRing));
  return {
    v: 1,
    icao: a.icao,
    fetchedAt: now.toISOString(),
    center,
    // The OFP's field elevation when there is one; else the DEM at the reference point.
    fieldElevFt: a.elevation ?? Math.round(ft[0]),
    grid,
    runway: a.runway,
    runwayHdg,
    approach: ft.slice(1 + rings.length),
    features: features.f.filter((f) => f.distNm <= RADIUS_NM),
    featuresError: features.err,
  };
}

// ---------- Cache (terrain doesn't change: keep it 30 days per airport and runway) ----------

const CACHE_PREFIX = 'msfs-buddy.terrain.';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export function cachedTerrain(icao: string, runway: string, now = Date.now()): TerrainData | null {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE_PREFIX + icao) ?? 'null') as TerrainData | null;
    if (!d || d.v !== 1 || d.runway !== runway || now - Date.parse(d.fetchedAt) > MAX_AGE_MS || d.featuresError) return null;
    return d;
  } catch {
    return null;
  }
}

export function cacheTerrain(d: TerrainData) {
  try {
    localStorage.setItem(CACHE_PREFIX + d.icao, JSON.stringify(d));
  } catch {
    // storage full or unavailable: it's only a cache
  }
}
