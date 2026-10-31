// Hand a SimPlanner flight to the EFB. Both apps are pages of the same site,
// so they share the browser's storage: SimPlanner writes the flight in the
// EFB's own flight-plan format (the one it builds from SimBrief) and the EFB
// shows it like any other OFP. Nothing leaves the browser.
//
// Navlog times, fuel and altitudes per fix are spread along the route from
// SimPlanner's climb / cruise / descent estimates: ESTIMATES, like the rest
// of the plan.

import type { Airport as EfbAirport, Fix, FlightPlan } from '../../lib/simbrief';
import type { Airport } from './airports';
import { distanceNm } from './geo';
import { ESTIMATE_WARNING, type PlanResult } from './planning';
import type { AircraftProfile } from './profiles';
import type { ParsedRoute } from './route';
import type { FlightInputs } from './store';
import { blockTimes, zulu, type BlockTimes } from './times';

/** ICAO type designators for the shipped profiles (others show their name only). */
const TYPE_CODES: Record<string, string> = {
  'fenix-a320': 'A320',
  'fslabs-a321': 'A321',
  'ifly-737-max8': 'B38M',
  'pmdg-737-800': 'B738',
  'pmdg-777-200er': 'B772',
};

export interface EfbFlightInput {
  inputs: FlightInputs;
  plan: PlanResult;
  route: ParsedRoute;
  profile: AircraftProfile;
  dep: Airport;
  arr: Airport;
  altn: Airport | null;
  fmcText: string;
  now?: Date;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const round = (n: number) => Math.round(n);

/** Word-wrap a line for the fixed-width OFP. */
function wrap(text: string, width = 78, indent = '      '): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) {
      out.push(line);
      line = indent + word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

function airport(a: Airport, runway: string): EfbAirport {
  return { icao: a.icao, iata: '', name: a.name, runway, elevation: a.elevationFt, lat: a.lat, lon: a.lon, transAlt: null, transLevel: null, metar: '', taf: '' };
}

/** Position along the route -> stage, altitude, minutes and fuel used, from the phase estimates. */
function profileAt(d: number, total: number, p: PlanResult, cruiseFt: number, depElev: number, arrElev: number) {
  const climb = Math.min(p.climb.distanceNm, total);
  const descent = Math.min(p.descent.distanceNm, Math.max(0, total - climb));
  const cruise = Math.max(0, total - climb - descent);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  if (d <= climb && climb > 0) {
    const t = d / climb;
    return { stage: 'CLB', alt: lerp(depElev, cruiseFt, t), min: p.climb.timeMin * t, fuel: p.climb.fuel * t };
  }
  if (d <= climb + cruise) {
    const t = cruise > 0 ? (d - climb) / cruise : 1;
    return { stage: 'CRZ', alt: cruiseFt, min: p.climb.timeMin + p.cruise.timeMin * t, fuel: p.climb.fuel + p.cruise.fuel * t };
  }
  const t = descent > 0 ? (d - climb - cruise) / descent : 1;
  return {
    stage: 'DSC',
    alt: lerp(cruiseFt, arrElev, t),
    min: p.climb.timeMin + p.cruise.timeMin + p.descent.timeMin * t,
    fuel: p.climb.fuel + p.cruise.fuel + p.descent.fuel * t,
  };
}

function textOfp(x: EfbFlightInput, block: number, times: BlockTimes | null): string {
  const { inputs: i, plan: p, profile, dep, arr, altn, route } = x;
  const u = p.units.toUpperCase();
  const w = (n: number) => String(round(n)).padStart(7);
  const hm = (min: number) => `${Math.floor(min / 60)}:${String(round(min % 60)).padStart(2, '0')}`;
  const lines = [
    `[ SimPlanner OFP ]   ${i.flightNo || ''}   ${dep.icao}-${arr.icao}   ${profile.name}${i.variant ? ` (${i.variant})` : ''}`,
    '',
    `ROUTE: ${dep.icao}/${i.depRwy || '---'} ${route.fmcRoute || 'DCT'} ${arr.icao}/${i.arrRwy || '---'}`,
    `DIST ${round(p.distanceNm)} NM   FL${i.cruiseFl}   CI ${i.costIndex}   AVG WIND ${i.windKt >= 0 ? 'P' : 'M'}${Math.abs(i.windKt)}`,
    `ALTN ${altn ? `${altn.icao} ${round(p.alternateDistanceNm)} NM` : 'NONE'}`,
    ...(times ? [`OUT ${zulu(times.out)}   OFF ${zulu(times.off)}   ON ${zulu(times.on)}   IN ${zulu(times.in)}   (${times.out.toISOString().slice(0, 10)})`] : []),
    '',
    `FUEL (${u})       TIME`,
    `TRIP     ${w(p.fuel.trip)}   ${hm(p.tripTimeMin)}`,
    `CONT     ${w(p.fuel.contingency)}`,
    `ALTN     ${w(p.fuel.alternate)}`,
    `FINRES   ${w(p.fuel.reserve)}`,
    `EXTRA    ${w(p.fuel.extra)}`,
    `TAXI     ${w(p.fuel.taxi)}`,
    `BLOCK    ${w(block)}`,
    '',
    `WEIGHTS (${u})`,
    `PAX ${i.paxCount}   CARGO ${round(i.cargo)}   PAYLOAD ${round(p.weights.payload)}`,
    `ZFW ${round(p.weights.zfw)}   TOW ${round(p.weights.tow)}   LW ${round(p.weights.lw)}`,
    ...p.limits.map((l) => `${l.ok ? '   ' : '!! '}${l.name.toUpperCase()}: ${round(l.value)} / MAX ${round(l.limit)}`),
    '',
    ...[...p.warnings, ...route.warnings].flatMap((m) => wrap(`NOTE: ${m}`)),
    '',
    x.fmcText,
    '',
    ...wrap(`*** ${ESTIMATE_WARNING} Simulation use only. ***`, 78, ''),
  ];
  return `<pre>${esc(lines.join('\n'))}</pre>`;
}

export function toEfbPlan(x: EfbFlightInput): FlightPlan {
  const { inputs: i, plan: p, route, profile, dep, arr, altn } = x;
  const now = x.now ?? new Date();
  const units = p.units === 'lb' ? 'lbs' : 'kgs';
  const cruiseFt = i.cruiseFl * 100;
  const taxiMin = profile.defaults.taxiMinutes ?? 0;
  const block = p.fuel.block;
  const times = blockTimes(i.depTime, taxiMin, p.tripTimeMin);
  const unix = (d: Date | undefined) => (d ? Math.floor(d.getTime() / 1000) : null);

  // Navlog: every point after the departure, with times and fuel spread over the phases.
  const navlog: Fix[] = [];
  let total = 0;
  for (const leg of route.legs) {
    total += leg.distanceNm;
    const at = profileAt(total, p.distanceNm || total, p, cruiseFt, dep.elevationFt ?? 0, arr.elevationFt ?? 0);
    const isArr = leg.to.ident === arr.icao && leg === route.legs[route.legs.length - 1];
    navlog.push({
      ident: leg.to.ident,
      name: leg.to.name ?? '',
      type: isArr ? 'apt' : leg.to.type === 'vor' ? 'vor' : leg.to.type === 'ndb' ? 'ndb' : 'wpt',
      via: leg.via || 'DCT',
      stage: isArr ? 'DSC' : at.stage,
      isSidStar: false,
      lat: leg.to.lat,
      lon: leg.to.lon,
      altitude: isArr ? (arr.elevationFt ?? null) : round(at.alt / 100) * 100,
      windDir: null,
      windSpd: null,
      oat: null,
      trackMag: null, // SimPlanner works in true courses; no magnetic variation data
      legDistance: round(leg.distanceNm),
      totalDistance: round(total),
      legTime: null,
      totalTime: round(at.min * 60),
      fuelOnboard: round(p.fuel.takeoff - at.fuel),
      fuelUsed: round(at.fuel),
      mach: '',
      ias: null,
      tas: at.stage === 'CRZ' ? profile.performance.cruiseTasKt : null,
      gs: at.stage === 'CRZ' ? profile.performance.cruiseTasKt + i.windKt : null,
      frequency: '',
    });
  }
  // The departure itself, as SimBrief's navlog starts.
  navlog.unshift({
    ...navlog[0],
    ident: dep.icao, name: dep.name, type: 'apt', via: '', stage: 'CLB', lat: dep.lat, lon: dep.lon, altitude: dep.elevationFt ?? null,
    legDistance: 0, totalDistance: 0, totalTime: 0, fuelOnboard: round(p.fuel.takeoff), fuelUsed: 0, tas: null,
  });

  const flightNo = i.flightNo.toUpperCase();
  return {
    id: `simplanner-${now.getTime()}`,
    source: 'simplanner',
    generatedAt: Math.floor(now.getTime() / 1000),
    airac: '',
    units,
    callsign: flightNo,
    flightNumber: flightNo,
    airline: flightNo.match(/^[A-Z]{2,3}/)?.[0] ?? '',
    aircraft: { icao: TYPE_CODES[profile.id] ?? '', name: profile.name + (i.variant ? ` (${i.variant})` : ''), reg: '', selcal: '' },
    origin: airport(dep, i.depRwy),
    destination: airport(arr, i.arrRwy),
    alternates: altn ? [airport(altn, '')] : [],
    route: route.fmcRoute || 'DCT',
    atcRoute: route.fmcRoute || 'DCT',
    atcFlightPlan: '',
    cruiseAlt: cruiseFt,
    costIndex: String(i.costIndex),
    cruiseProfile: `CI ${i.costIndex}`,
    airDistance: round(p.distanceNm),
    gcDistance: round(distanceNm(dep, arr)),
    routeDistance: round(p.distanceNm),
    avgWindComp: i.windKt,
    avgWind: '',
    passengers: i.paxCount,
    times: {
      // From the departure time set on Dispatch, if any.
      schedOut: unix(times?.out), schedOff: unix(times?.off), schedOn: unix(times?.on), schedIn: unix(times?.in),
      estOut: unix(times?.out), estOff: unix(times?.off), estOn: unix(times?.on), estIn: unix(times?.in),
      ete: round(p.tripTimeMin * 60),
      block: round((p.tripTimeMin + 2 * taxiMin) * 60),
    },
    fuel: {
      taxi: round(p.fuel.taxi),
      trip: round(p.fuel.trip),
      contingency: round(p.fuel.contingency),
      alternate: round(p.fuel.alternate),
      reserve: round(p.fuel.reserve),
      extra: round(p.fuel.extra),
      minTakeoff: round(p.fuel.takeoff - p.fuel.extra),
      planTakeoff: round(p.fuel.takeoff),
      planRamp: round(block),
      planLanding: round(p.fuel.landing),
      avgFlow: p.tripTimeMin > 0 ? round((p.fuel.trip / p.tripTimeMin) * 60) : null,
      maxTanks: profile.weights.maxFuel,
    },
    weights: {
      oew: round(p.weights.oew),
      paxCount: i.paxCount,
      bagCount: null,
      paxWeight: i.paxWeight,
      cargo: round(i.cargo),
      payload: round(p.weights.payload),
      zfw: round(p.weights.zfw),
      maxZfw: profile.weights.mzfw,
      tow: round(p.weights.tow),
      maxTow: profile.weights.mtow,
      ldw: round(p.weights.lw),
      maxLdw: profile.weights.mlw,
      ramp: round(p.weights.ramp),
    },
    navlog,
    ofpHtml: textOfp(x, block, times),
    pdfUrl: '',
    mapImages: [],
    takeoff: null,
    landing: null,
    remarks: [`Planned in SimPlanner. ${ESTIMATE_WARNING}`],
  };
}
