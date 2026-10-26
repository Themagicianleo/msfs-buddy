// Random payload, the way SimBrief fills in a load when you don't: a
// realistic passenger load factor plus some cargo, then trimmed so the flight
// stays inside the aircraft's weight limits.

import { computePlan, type FieldElevations } from './planning';
import type { AircraftProfile } from './profiles';
import type { FlightInputs } from './store';
import { convertWeight } from './units';

export type Rng = () => number;

/** Small seeded generator (mulberry32) so tests and re-rolls are repeatable. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular distribution between min and max, most likely at mode. */
export function triangular(rng: Rng, min: number, mode: number, max: number): number {
  const u = rng();
  const c = (mode - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export interface PayloadResult {
  paxCount: number;
  cargo: number;
  loadFactor: number;
  trimmed: boolean;
  note: string;
}

/**
 * Passengers: load factor between 55% and 100%, most often around 85%.
 * Cargo: 5–70% of the hold's limit, most often around 30%, rounded to 10.
 * Weights are in the flight's units.
 */
export function randomPayload(profile: AircraftProfile, inputs: FlightInputs, rng: Rng = Math.random): { paxCount: number; cargo: number; loadFactor: number } {
  const unit = inputs.units ?? profile.units;
  const maxCargo = convertWeight(profile.capacity.maxCargo, profile.units, unit);
  const loadFactor = triangular(rng, 0.55, 0.85, 1.0);
  const paxCount = Math.min(profile.capacity.maxPax, Math.round(profile.capacity.maxPax * loadFactor));
  const cargo = Math.round((maxCargo * triangular(rng, 0.05, 0.3, 0.7)) / 10) * 10;
  return { paxCount, cargo, loadFactor };
}

/**
 * Take off cargo first, then passengers, until ZFW, TOW and LW are all within
 * the profile limits for this trip (block fuel is part of TOW, so the
 * distance matters).
 */
export function fitPayload(
  inputs: FlightInputs,
  profile: AircraftProfile,
  distanceNm: number,
  alternateNm: number,
  elev: FieldElevations,
): { paxCount: number; cargo: number; trimmed: boolean } {
  const unit = inputs.units ?? profile.units;
  const cargoStep = Math.max(10, Math.round(convertWeight(profile.capacity.maxCargo, profile.units, unit) / 20 / 10) * 10);
  const paxStep = Math.max(1, Math.round(profile.capacity.maxPax / 50));
  let { paxCount, cargo } = inputs;
  let trimmed = false;
  for (let i = 0; i < 200; i++) {
    const plan = computePlan({ ...inputs, paxCount, cargo }, profile, distanceNm, alternateNm, elev);
    const over = plan.exceeded.some((l) => l.name === 'Zero fuel weight' || l.name === 'Takeoff weight' || l.name === 'Landing weight');
    if (!over) break;
    trimmed = true;
    if (cargo > 0) cargo = Math.max(0, cargo - cargoStep);
    else if (paxCount > 0) paxCount = Math.max(0, paxCount - paxStep);
    else break;
  }
  return { paxCount, cargo, trimmed };
}

export function describeLoad(paxCount: number, cargo: number, maxPax: number, unit: string, trimmed: boolean): string {
  const pct = maxPax ? Math.round((paxCount / maxPax) * 100) : 0;
  return `Random load: ${paxCount} passengers (${pct}% of ${maxPax} seats) and ${cargo.toLocaleString('en-US')} ${unit} of cargo${trimmed ? ', reduced to stay within the weight limits' : ''}.`;
}
