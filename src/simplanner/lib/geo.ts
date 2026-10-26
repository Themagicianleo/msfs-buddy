// Great-circle maths on a spherical Earth. Good to well under 0.5% for
// flight planning distances; not a geodesic (ellipsoid) solution.

export const EARTH_RADIUS_NM = 3440.065;

export interface LatLon {
  lat: number;
  lon: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in nautical miles (haversine). */
export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle course from a to b, degrees TRUE (0–360). */
export function initialCourseTrue(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function isValidLatLon(p: Partial<LatLon>): p is LatLon {
  return (
    typeof p.lat === 'number' && typeof p.lon === 'number' &&
    Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
  );
}

/**
 * Parse a coordinate written in a route string. Supported forms:
 *   4530N11630E  (DDMM + DDDMM, ICAO style)   45N116E  (whole degrees)
 *   40.0801/116.5845  (decimal degrees, south/west negative)
 */
export function parseCoordinate(token: string): LatLon | null {
  const t = token.trim().toUpperCase();
  let m = t.match(/^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/);
  if (m) {
    const lat = (+m[1] + (m[2] ? +m[2] / 60 : 0)) * (m[3] === 'S' ? -1 : 1);
    const lon = (+m[4] + (m[5] ? +m[5] / 60 : 0)) * (m[6] === 'W' ? -1 : 1);
    const p = { lat, lon };
    return isValidLatLon(p) ? p : null;
  }
  m = t.match(/^(-?\d{1,2}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) {
    const p = { lat: +m[1], lon: +m[2] };
    return isValidLatLon(p) ? p : null;
  }
  return null;
}

/** Degrees/minutes/seconds, e.g. N40° 4' 48.00" (used by the MSFS .pln format). */
export function toDms(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  let d = Math.floor(abs);
  let mFloat = (abs - d) * 60;
  let m = Math.floor(mFloat);
  let s = Math.round((mFloat - m) * 60 * 100) / 100;
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${hemi}${d}° ${m}' ${s.toFixed(2)}"`;
}
