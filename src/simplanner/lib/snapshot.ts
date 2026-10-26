// Compact, self-contained summaries that travel inside a URL fragment.
//  - BriefingSnapshot: everything the kiosk page shows (no lookups needed).
//  - SharedFlight: a flight's inputs plus the custom airports/waypoints it
//    uses, so the planner on another device can recreate it.

import type { Airport } from './airports';
import type { CustomWaypoint } from './navdata';
import { ESTIMATE_WARNING, type PlanResult } from './planning';
import type { ParsedRoute } from './route';
import type { FlightInputs } from './store';

export interface BriefingSnapshot {
  app: 'simplanner-briefing';
  v: 1;
  createdAt: string;
  flightNo: string;
  aircraft: string;
  units: string;
  dep: string;
  arr: string;
  altn: string;
  depRwy: string;
  arrRwy: string;
  route: string;
  cruiseFl: number;
  costIndex: number;
  distanceNm: number;
  tripMin: number;
  fuel: Record<string, number>;
  weights: Record<string, number>;
  limits: { name: string; value: number; limit: number; ok: boolean; unit: string }[];
  warnings: string[];
  fmc: string;
  notice: string;
}

export function makeSnapshot(inputs: FlightInputs, plan: PlanResult, route: ParsedRoute, aircraftName: string, fmcText: string): BriefingSnapshot {
  const r = (n: number) => Math.round(n);
  return {
    app: 'simplanner-briefing',
    v: 1,
    createdAt: new Date().toISOString(),
    flightNo: inputs.flightNo,
    aircraft: aircraftName + (inputs.variant ? ` (${inputs.variant})` : ''),
    units: plan.units,
    dep: inputs.dep.toUpperCase(),
    arr: inputs.arr.toUpperCase(),
    altn: inputs.altn.toUpperCase(),
    depRwy: inputs.depRwy.toUpperCase(),
    arrRwy: inputs.arrRwy.toUpperCase(),
    route: [inputs.dep.toUpperCase(), route.fmcRoute, inputs.arr.toUpperCase()].filter(Boolean).join(' '),
    cruiseFl: inputs.cruiseFl,
    costIndex: inputs.costIndex,
    distanceNm: r(plan.distanceNm),
    tripMin: r(plan.tripTimeMin),
    fuel: Object.fromEntries(Object.entries(plan.fuel).map(([k, v]) => [k, r(v)])),
    weights: { zfw: r(plan.weights.zfw), tow: r(plan.weights.tow), lw: r(plan.weights.lw), payload: r(plan.weights.payload), pax: inputs.paxCount, cargo: r(inputs.cargo) },
    limits: plan.limits.map((l) => ({ name: l.name, value: r(l.value), limit: r(l.limit), ok: l.ok, unit: l.unit })),
    warnings: [...plan.warnings, ...route.warnings],
    fmc: fmcText,
    notice: ESTIMATE_WARNING,
  };
}

export interface SharedFlight {
  app: 'simplanner-flight';
  v: 1;
  inputs: FlightInputs;
  airports: Airport[];
  waypoints: CustomWaypoint[];
  /** Departure/arrival/alternate from the airport database, used only if the other device can't find them. */
  refAirports?: Airport[];
}

export function makeSharedFlight(
  inputs: FlightInputs,
  route: ParsedRoute,
  customAirports: Airport[],
  customWaypoints: CustomWaypoint[],
  endpoints: (Airport | null)[] = [],
): SharedFlight {
  const used = new Set([inputs.dep, inputs.arr, inputs.altn, ...route.points.map((p) => p.ident)].map((s) => s.toUpperCase()));
  return {
    app: 'simplanner-flight',
    v: 1,
    inputs,
    airports: customAirports.filter((a) => used.has(a.icao.toUpperCase())),
    waypoints: customWaypoints.filter((w) => used.has(w.ident.toUpperCase())),
    refAirports: endpoints.filter((a): a is Airport => !!a && a.source !== 'custom').map((a) => ({ ...a, runways: a.runways.slice(0, 12) })),
  };
}
