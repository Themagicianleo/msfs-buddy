// Fuel, time and weight model. Deliberately simple and transparent: every
// step is written into `formulas` with the numbers used, so you can see and
// tune it. These are ESTIMATES for simulation, not certified performance.

import { withVariant, type AircraftProfile } from './profiles';
import { convertWeight, type WeightUnit } from './units';

export interface PlanInputs {
  profileId: string;
  variant?: string;
  units?: WeightUnit; // override; defaults to the profile's units
  cruiseFl: number;
  paxCount: number;
  cargo: number;
  paxWeight: number; // average per passenger, including bags
  contingencyPct: number;
  reserveMin: number; // final reserve (holding) time
  taxiFuel: number;
  extraFuel: number;
  windKt: number; // average wind component in cruise: + tailwind, − headwind
  costIndex: number;
}

export interface PhaseResult {
  distanceNm: number;
  timeMin: number;
  fuel: number;
}

export interface LimitCheck {
  name: string;
  value: number;
  limit: number;
  ok: boolean;
  margin: number; // limit − value (negative = exceeded)
  unit: string;
}

export interface PlanResult {
  units: WeightUnit;
  distanceNm: number;
  alternateDistanceNm: number;
  climb: PhaseResult;
  cruise: PhaseResult;
  descent: PhaseResult;
  tripTimeMin: number;
  fuel: {
    taxi: number;
    trip: number;
    contingency: number;
    alternate: number;
    reserve: number;
    extra: number;
    block: number;
    takeoff: number;
    landing: number;
  };
  weights: { oew: number; paxLoad: number; cargo: number; payload: number; zfw: number; ramp: number; tow: number; lw: number };
  limits: LimitCheck[];
  exceeded: LimitCheck[];
  warnings: string[];
  formulas: string[];
}

const f0 = (n: number) => Math.round(n).toLocaleString('en-US');
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US');

/** Climb, cruise, descent for one flight segment at one cruise level. */
export function flightPhases(
  distanceNm: number,
  cruiseAltFt: number,
  perf: AircraftProfile['performance'],
  windKt: number,
  label: string,
  formulas: string[],
  fromElevFt = 0,
  toElevFt = 0,
): { climb: PhaseResult; cruise: PhaseResult; descent: PhaseResult; scaled: boolean } {
  const b = perf.burnPerHour;
  // Climb from the departure field and descend to the arrival field, not from sea level.
  const climbFt = Math.max(0, cruiseAltFt - fromElevFt);
  const descFt = Math.max(0, cruiseAltFt - toElevFt);
  let climbMin = climbFt / perf.climbRateFpm;
  let climbNm = (climbMin / 60) * perf.climbSpeedKt;
  let descNm = (descFt / 1000) * perf.descentNmPer1000ft;
  let descMin = (descNm / perf.descentSpeedKt) * 60;

  const from = fromElevFt ? ` (${f0(cruiseAltFt)} − field ${f0(fromElevFt)})` : '';
  const to = toElevFt ? ` (${f0(cruiseAltFt)} − field ${f0(toElevFt)})` : '';
  formulas.push(
    `${label} climb time = ${f0(climbFt)} ft${from} ÷ ${f0(perf.climbRateFpm)} fpm = ${f1(climbMin)} min`,
    `${label} climb distance = ${f1(climbMin)} min ÷ 60 × ${f0(perf.climbSpeedKt)} kt = ${f1(climbNm)} nm`,
    `${label} descent distance = ${f1(descFt / 1000)} thousand ft${to} × ${perf.descentNmPer1000ft} nm per 1,000 ft = ${f1(descNm)} nm`,
    `${label} descent time = ${f1(descNm)} nm ÷ ${f0(perf.descentSpeedKt)} kt × 60 = ${f1(descMin)} min`,
  );

  let scaled = false;
  if (distanceNm > 0 && climbNm + descNm > distanceNm) {
    const k = distanceNm / (climbNm + descNm);
    climbMin *= k;
    climbNm *= k;
    descMin *= k;
    descNm *= k;
    scaled = true;
    formulas.push(`${label}: climb + descent (${f1((climbNm + descNm) / k)} nm) is longer than the leg, so both are scaled by ${f1(k * 100)}% and there is no cruise.`);
  }

  const cruiseNm = Math.max(0, distanceNm - climbNm - descNm);
  const gs = Math.max(50, perf.cruiseTasKt + windKt);
  const cruiseMin = (cruiseNm / gs) * 60;
  formulas.push(
    `${label} cruise distance = ${f1(distanceNm)} − ${f1(climbNm)} − ${f1(descNm)} = ${f1(cruiseNm)} nm`,
    `${label} cruise ground speed = ${f0(perf.cruiseTasKt)} kt TAS ${windKt >= 0 ? '+' : '−'} ${f0(Math.abs(windKt))} kt wind = ${f0(gs)} kt`,
    `${label} cruise time = ${f1(cruiseNm)} nm ÷ ${f0(gs)} kt × 60 = ${f1(cruiseMin)} min`,
  );

  const climb = { distanceNm: climbNm, timeMin: climbMin, fuel: (climbMin / 60) * b.climb };
  const cruise = { distanceNm: cruiseNm, timeMin: cruiseMin, fuel: (cruiseMin / 60) * b.cruise };
  const descent = { distanceNm: descNm, timeMin: descMin, fuel: (descMin / 60) * b.descent };
  formulas.push(
    `${label} fuel = climb ${f1(climbMin)} min × ${f0(b.climb)}/h + cruise ${f1(cruiseMin)} min × ${f0(b.cruise)}/h + descent ${f1(descMin)} min × ${f0(b.descent)}/h = ${f0(climb.fuel + cruise.fuel + descent.fuel)}`,
  );
  return { climb, cruise, descent, scaled };
}

/** Convert all weight figures in a profile into the requested unit. */
function profileIn(p: AircraftProfile, unit: WeightUnit): AircraftProfile {
  if (p.units === unit) return p;
  const c = (v: number) => convertWeight(v, p.units, unit);
  const b = p.performance.burnPerHour;
  return {
    ...p,
    units: unit,
    weights: { oew: c(p.weights.oew), mtow: c(p.weights.mtow), mlw: c(p.weights.mlw), mzfw: c(p.weights.mzfw), maxFuel: c(p.weights.maxFuel) },
    capacity: { ...p.capacity, maxCargo: c(p.capacity.maxCargo) },
    defaults: { ...p.defaults, paxWeight: c(p.defaults.paxWeight) },
    performance: {
      ...p.performance,
      burnPerHour: { taxi: c(b.taxi), climb: c(b.climb), cruise: c(b.cruise), descent: c(b.descent), holding: c(b.holding) },
    },
  };
}

export interface FieldElevations {
  dep?: number | null;
  arr?: number | null;
  altn?: number | null;
}

export function computePlan(
  inputs: PlanInputs,
  profile: AircraftProfile,
  distanceNm: number,
  alternateDistanceNm: number,
  elev: FieldElevations = {},
): PlanResult {
  const unit = inputs.units ?? profile.units;
  const p = profileIn(withVariant(profile, inputs.variant), unit);
  const formulas: string[] = [];
  const warnings: string[] = [];
  const u = unit;

  const cruiseAlt = inputs.cruiseFl * 100;
  const main = flightPhases(distanceNm, cruiseAlt, p.performance, inputs.windKt, 'Trip', formulas, elev.dep ?? 0, elev.arr ?? 0);
  if (main.scaled) warnings.push(`The route is too short to reach FL${inputs.cruiseFl} in this model; pick a lower cruise level.`);
  if (cruiseAlt < Math.max(elev.dep ?? 0, elev.arr ?? 0) + 5000) warnings.push(`FL${inputs.cruiseFl} is less than 5,000 ft above an airport: far too low.`);
  const tripFuel = main.climb.fuel + main.cruise.fuel + main.descent.fuel;
  const tripTimeMin = main.climb.timeMin + main.cruise.timeMin + main.descent.timeMin;

  let alternateFuel = 0;
  if (alternateDistanceNm > 0) {
    // The alternate leg must at least clear both fields by the usual margin.
    const altnFl = Math.max(p.reserves.alternateCruiseFl, Math.ceil((Math.max(elev.arr ?? 0, elev.altn ?? 0) + 6000) / 1000) * 10);
    if (altnFl !== p.reserves.alternateCruiseFl) formulas.push(`Alternate cruise raised to FL${altnFl} (6,000 ft above the higher of the arrival/alternate fields).`);
    const alt = flightPhases(alternateDistanceNm, altnFl * 100, p.performance, 0, 'Alternate', formulas, elev.arr ?? 0, elev.altn ?? 0);
    alternateFuel = alt.climb.fuel + alt.cruise.fuel + alt.descent.fuel;
  } else {
    formulas.push('Alternate fuel = 0 (no alternate entered).');
    warnings.push('No alternate entered: alternate fuel is 0.');
  }

  const holding = p.performance.burnPerHour.holding;
  const pctFuel = tripFuel * (inputs.contingencyPct / 100);
  const minCont = (p.reserves.minContingencyMin / 60) * holding;
  const contingency = Math.max(pctFuel, minCont);
  formulas.push(
    `Contingency = max(${inputs.contingencyPct}% × ${f0(tripFuel)} = ${f0(pctFuel)}, ${p.reserves.minContingencyMin} min × ${f0(holding)}/h holding = ${f0(minCont)}) = ${f0(contingency)}`,
  );
  const reserve = (inputs.reserveMin / 60) * holding;
  formulas.push(`Final reserve = ${inputs.reserveMin} min × ${f0(holding)}/h holding = ${f0(reserve)}`);

  const taxi = inputs.taxiFuel;
  const extra = inputs.extraFuel;
  const block = taxi + tripFuel + contingency + alternateFuel + reserve + extra;
  formulas.push(
    `Block fuel = taxi ${f0(taxi)} + trip ${f0(tripFuel)} + contingency ${f0(contingency)} + alternate ${f0(alternateFuel)} + reserve ${f0(reserve)} + extra ${f0(extra)} = ${f0(block)} ${u}`,
  );
  const takeoffFuel = block - taxi;
  const landingFuel = takeoffFuel - tripFuel;

  const paxLoad = inputs.paxCount * inputs.paxWeight;
  const payload = paxLoad + inputs.cargo;
  const zfw = p.weights.oew + payload;
  const ramp = zfw + block;
  const tow = zfw + takeoffFuel;
  const lw = tow - tripFuel;
  formulas.push(
    `Payload = ${inputs.paxCount} pax × ${f0(inputs.paxWeight)} + cargo ${f0(inputs.cargo)} = ${f0(payload)} ${u}`,
    `ZFW = OEW ${f0(p.weights.oew)} + payload ${f0(payload)} = ${f0(zfw)} ${u}`,
    `TOW = ZFW ${f0(zfw)} + takeoff fuel ${f0(takeoffFuel)} = ${f0(tow)} ${u}`,
    `LW = TOW ${f0(tow)} − trip fuel ${f0(tripFuel)} = ${f0(lw)} ${u}`,
  );

  const check = (name: string, value: number, limit: number, unitLabel: string): LimitCheck => ({
    name,
    value,
    limit,
    ok: value <= limit,
    margin: limit - value,
    unit: unitLabel,
  });
  const limits = [
    check('Zero fuel weight', zfw, p.weights.mzfw, u),
    check('Takeoff weight', tow, p.weights.mtow, u),
    check('Landing weight', lw, p.weights.mlw, u),
    check('Block fuel', block, p.weights.maxFuel, u),
    check('Passengers', inputs.paxCount, p.capacity.maxPax, 'pax'),
    check('Cargo', inputs.cargo, p.capacity.maxCargo, u),
  ];
  const exceeded = limits.filter((l) => !l.ok);
  for (const l of exceeded) {
    warnings.unshift(`LIMIT EXCEEDED: ${l.name} ${f0(l.value)} ${l.unit} is over the profile limit of ${f0(l.limit)} ${l.unit} by ${f0(-l.margin)} ${l.unit}.`);
  }
  if (!profile.verified) warnings.push(`${profile.name}: profile values are PLACEHOLDERS that you have not verified yet.`);

  return {
    units: u,
    distanceNm,
    alternateDistanceNm,
    climb: main.climb,
    cruise: main.cruise,
    descent: main.descent,
    tripTimeMin,
    fuel: { taxi, trip: tripFuel, contingency, alternate: alternateFuel, reserve, extra, block, takeoff: takeoffFuel, landing: landingFuel },
    weights: { oew: p.weights.oew, paxLoad, cargo: inputs.cargo, payload, zfw, ramp, tow, lw },
    limits,
    exceeded,
    warnings,
    formulas,
  };
}

export const ESTIMATE_WARNING = 'Fuel and weights are estimates, verify with the aircraft’s own performance tools.';

/** Default taxi fuel from the profile: taxi burn per hour × typical taxi time. */
export function defaultTaxiFuel(p: AircraftProfile): number {
  return Math.round(((p.performance.burnPerHour.taxi * p.defaults.taxiMinutes) / 60) / 10) * 10;
}
