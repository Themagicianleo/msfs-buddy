export type WeightUnit = 'kg' | 'lb';

export const LB_PER_KG = 2.20462262;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG;
}

export function fmtWeight(value: number | null | undefined, unit?: WeightUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('en-US')}${unit ? ' ' + unit : ''}`;
}

/** Minutes → "H:MM". */
export function fmtHm(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
