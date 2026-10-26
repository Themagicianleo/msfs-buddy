// FMC cheat sheets. Templates are plain-text files in ../defaults/fmc/*.txt
// (editable in the app; your edits are saved in the browser). Placeholders
// like {zfw_t} are filled from the plan; unknown ones are left as typed so
// a typo is easy to spot.

import type { PlanResult } from './planning';
import type { ParsedRoute } from './route';
import type { FlightInputs } from './store';

const modules = import.meta.glob('../defaults/fmc/*.txt', { eager: true, query: '?raw', import: 'default' });

/** Default templates keyed by id (the file name without .txt). */
export const DEFAULT_TEMPLATES: Record<string, string> = Object.fromEntries(
  Object.entries(modules as Record<string, string>).map(([path, text]) => [path.split('/').pop()!.replace(/\.txt$/, ''), text]),
);

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

/** Descriptions shown in the template editor. */
export const PLACEHOLDERS: Record<string, string> = {
  dep: 'Departure ICAO',
  arr: 'Arrival ICAO',
  altn: 'Alternate ICAO',
  dep_rwy: 'Departure runway',
  arr_rwy: 'Arrival runway',
  flight_no: 'Flight number',
  aircraft: 'Aircraft profile name',
  variant: 'Engine/variant (777)',
  route: 'Full route incl. airports',
  route_fmc: 'Route without airports (to type into the FMC)',
  cruise_fl: 'Cruise level, e.g. FL350',
  cruise_alt: 'Cruise altitude in feet, e.g. 35000',
  cost_index: 'Cost index',
  units: 'KG or LB',
  zfw: 'Zero fuel weight', zfw_t: 'ZFW in thousands, 1 decimal (e.g. 61.6)',
  block_fuel: 'Block fuel', block_fuel_t: 'Block fuel in thousands',
  trip_fuel: 'Trip fuel', trip_fuel_t: 'Trip fuel in thousands',
  contingency_fuel: 'Contingency fuel', contingency_fuel_t: 'Contingency fuel in thousands', contingency_pct: 'Contingency %',
  alternate_fuel: 'Alternate fuel', alternate_fuel_t: 'Alternate fuel in thousands',
  final_reserve: 'Final reserve fuel', final_reserve_t: 'Final reserve in thousands', final_reserve_min: 'Final reserve time (min)',
  reserves_total: 'Alternate + final reserve', reserves_total_t: 'Alternate + final reserve in thousands',
  taxi_fuel: 'Taxi fuel', tow: 'Takeoff weight', tow_t: 'TOW in thousands', lw: 'Landing weight', lw_t: 'LW in thousands',
  pax: 'Passengers', cargo: 'Cargo', trip_time: 'Trip time H:MM', distance: 'Route distance (nm)',
};

export function templateVars(inputs: FlightInputs, plan: PlanResult, route: ParsedRoute, aircraftName: string): Record<string, string> {
  const n = (v: number) => Math.round(v).toLocaleString('en-US');
  const t = (v: number) => (Math.round(v / 100) / 10).toFixed(1);
  const fl = Math.round(inputs.cruiseFl);
  const time = Math.round(plan.tripTimeMin);
  const reservesTotal = plan.fuel.alternate + plan.fuel.reserve;
  return {
    dep: inputs.dep.toUpperCase(),
    arr: inputs.arr.toUpperCase(),
    altn: inputs.altn.toUpperCase() || '(none)',
    dep_rwy: inputs.depRwy.toUpperCase() || '(not set)',
    arr_rwy: inputs.arrRwy.toUpperCase() || '(not set)',
    flight_no: inputs.flightNo.toUpperCase() || '(not set)',
    aircraft: aircraftName,
    variant: inputs.variant || '(base)',
    route: [inputs.dep.toUpperCase(), route.fmcRoute, inputs.arr.toUpperCase()].filter(Boolean).join(' '),
    route_fmc: route.fmcRoute || '(no route entered)',
    cruise_fl: `FL${String(fl).padStart(3, '0')}`,
    cruise_alt: String(fl * 100),
    cost_index: String(inputs.costIndex),
    units: plan.units.toUpperCase(),
    zfw: n(plan.weights.zfw), zfw_t: t(plan.weights.zfw),
    block_fuel: n(plan.fuel.block), block_fuel_t: t(plan.fuel.block),
    trip_fuel: n(plan.fuel.trip), trip_fuel_t: t(plan.fuel.trip),
    contingency_fuel: n(plan.fuel.contingency), contingency_fuel_t: t(plan.fuel.contingency), contingency_pct: String(inputs.contingencyPct),
    alternate_fuel: n(plan.fuel.alternate), alternate_fuel_t: t(plan.fuel.alternate),
    final_reserve: n(plan.fuel.reserve), final_reserve_t: t(plan.fuel.reserve), final_reserve_min: String(inputs.reserveMin),
    reserves_total: n(reservesTotal), reserves_total_t: t(reservesTotal),
    taxi_fuel: n(plan.fuel.taxi), tow: n(plan.weights.tow), tow_t: t(plan.weights.tow), lw: n(plan.weights.lw), lw_t: t(plan.weights.lw),
    pax: String(inputs.paxCount), cargo: n(inputs.cargo),
    trip_time: `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`,
    distance: n(plan.distanceNm),
  };
}
