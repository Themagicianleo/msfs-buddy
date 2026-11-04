export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export const KM_PER_NM = 1.852;

/** Nautical miles → kilometres. */
export function nmToKm(nm: number): number {
  return nm * KM_PER_NM;
}

/** "2.5 nm / 4.6 km": a distance in a label or note (keeps up to one decimal). */
export function nmKm(nm: number): string {
  const one = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? fmtNum(v) : fmtNum(v, 1));
  return `${one(nm)} nm / ${one(nmToKm(nm))} km`;
}

/** "333 nm · 617 km" (both rounded to whole numbers). */
export function fmtDistance(nm: number | null | undefined): string {
  if (nm === null || nm === undefined || !Number.isFinite(nm)) return '—';
  return `${fmtNum(nm)} nm · ${fmtNum(nmToKm(nm))} km`;
}

/** Seconds → "H:MM". */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Unix seconds → "HH:MMZ". */
export function fmtZulu(unix: number | null | undefined): string {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

export function fmtAltitude(ft: number | null | undefined, transAlt = 18000): string {
  if (ft === null || ft === undefined) return '—';
  if (ft >= transAlt) return `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
  return `${fmtNum(ft)} ft`;
}

export function ago(date: Date | null): string {
  if (!date) return '';
  const min = Math.round((Date.now() - date.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m ago`;
}
