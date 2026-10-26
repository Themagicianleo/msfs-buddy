// Aircraft profiles. Defaults live in ../defaults/profiles/*.json and ship
// with PLACEHOLDER numbers: round figures of roughly the right size, not
// taken from any manual. Every value must be checked by the user.

import type { WeightUnit } from './units';

export interface BurnPerHour {
  taxi: number;
  climb: number;
  cruise: number;
  descent: number;
  holding: number;
}

export interface Performance {
  cruiseTasKt: number;
  /** Average rate of climb from takeoff to cruise level. */
  climbRateFpm: number;
  /** Average ground speed during the climb. */
  climbSpeedKt: number;
  /** Descent distance per 1,000 ft to lose (the "3 to 1" rule = 3). */
  descentNmPer1000ft: number;
  descentSpeedKt: number;
  burnPerHour: BurnPerHour;
}

export interface Variant {
  notes?: string;
  performance?: Partial<Omit<Performance, 'burnPerHour'>> & { burnPerHour?: Partial<BurnPerHour> };
}

export interface AircraftProfile {
  id: string;
  name: string;
  /** Which FMC cheat-sheet template to use (file in defaults/fmc). */
  fmcTemplate: string;
  units: WeightUnit;
  /** Set to true once you have checked every number yourself. */
  verified: boolean;
  placeholderNotice: string;
  weights: { oew: number; mtow: number; mlw: number; mzfw: number; maxFuel: number };
  capacity: { maxPax: number; maxCargo: number };
  defaults: { paxWeight: number; costIndex: number; cruiseFl: number; taxiMinutes: number; minRunwayFt?: number };
  performance: Performance;
  reserves: { contingencyPct: number; minContingencyMin: number; finalReserveMin: number; alternateCruiseFl: number };
  vspeedNotes: string;
  notes: string;
  variants?: Record<string, Variant>;
}

const modules = import.meta.glob('../defaults/profiles/*.json', { eager: true, import: 'default' });
export const DEFAULT_PROFILES: AircraftProfile[] = Object.values(modules as Record<string, AircraftProfile>).sort((a, b) =>
  a.name.localeCompare(b.name),
);

/** Profile with a variant's overrides applied (e.g. 777 engine options). */
export function withVariant(p: AircraftProfile, variant?: string): AircraftProfile {
  const v = variant ? p.variants?.[variant] : undefined;
  if (!v?.performance) return p;
  return {
    ...p,
    performance: {
      ...p.performance,
      ...v.performance,
      burnPerHour: { ...p.performance.burnPerHour, ...v.performance.burnPerHour },
    },
  };
}

const NUM_PATHS = [
  'weights.oew', 'weights.mtow', 'weights.mlw', 'weights.mzfw', 'weights.maxFuel',
  'capacity.maxPax', 'capacity.maxCargo',
  'defaults.paxWeight', 'defaults.costIndex', 'defaults.cruiseFl', 'defaults.taxiMinutes',
  'performance.cruiseTasKt', 'performance.climbRateFpm', 'performance.climbSpeedKt', 'performance.descentNmPer1000ft', 'performance.descentSpeedKt',
  'performance.burnPerHour.taxi', 'performance.burnPerHour.climb', 'performance.burnPerHour.cruise', 'performance.burnPerHour.descent', 'performance.burnPerHour.holding',
  'reserves.contingencyPct', 'reserves.minContingencyMin', 'reserves.finalReserveMin', 'reserves.alternateCruiseFl',
];

/** Check an edited profile. Returns a list of problems (empty = OK). */
export function validateProfile(p: unknown): string[] {
  const errors: string[] = [];
  if (!p || typeof p !== 'object') return ['Profile must be a JSON object.'];
  const o = p as Record<string, unknown>;
  for (const k of ['id', 'name', 'fmcTemplate']) if (typeof o[k] !== 'string' || !o[k]) errors.push(`"${k}" must be a non-empty string.`);
  if (o.units !== 'kg' && o.units !== 'lb') errors.push('"units" must be "kg" or "lb".');
  if (typeof o.verified !== 'boolean') errors.push('"verified" must be true or false.');
  for (const path of NUM_PATHS) {
    const v = path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), o);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`"${path}" must be a number ≥ 0.`);
  }
  if (!errors.length) {
    const w = (o as unknown as AircraftProfile).weights;
    if (w.mzfw > w.mtow || w.mlw > w.mtow) errors.push('MZFW and MLW should not exceed MTOW.');
    if (w.oew >= w.mzfw) errors.push('OEW should be below MZFW.');
    const perf = (o as unknown as AircraftProfile).performance;
    if (!perf.cruiseTasKt || !perf.climbRateFpm || !perf.climbSpeedKt || !perf.descentSpeedKt) errors.push('Speeds and climb rate must be above 0.');
  }
  return errors;
}
