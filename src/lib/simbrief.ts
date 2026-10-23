// SimBrief OFP fetching and normalisation.
//
// The SimBrief "xml.fetcher" endpoint returns the latest OFP generated for a
// user. With json=1 every value comes back as a string, and empty XML nodes
// come back as `{}`, so everything is normalised here into a typed model.

import { apiUrl } from './http';

type Raw = Record<string, any>;

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  runway: string;
  elevation: number | null;
  lat: number | null;
  lon: number | null;
  transAlt: number | null;
  transLevel: number | null;
  metar: string;
  taf: string;
}

export interface Fix {
  ident: string;
  name: string;
  type: string;
  via: string;
  stage: string;
  isSidStar: boolean;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  windDir: number | null;
  windSpd: number | null;
  oat: number | null;
  trackMag: number | null;
  legDistance: number | null;
  totalDistance: number | null;
  legTime: number | null; // seconds
  totalTime: number | null; // seconds
  fuelOnboard: number | null;
  fuelUsed: number | null;
  mach: string;
  ias: number | null;
  tas: number | null;
  gs: number | null;
  frequency: string;
}

export interface TlrRunway {
  ident: string;
  length: number | null;
  flaps: string;
  thrust: string;
  flexTemp: number | null;
  v1: number | null;
  vr: number | null;
  v2: number | null;
  vref: number | null;
  maxWeight: number | null;
  headwind: number | null;
  crosswind: number | null;
  magCourse: number | null;
  distanceRequired: number | null;
}

export interface TlrSection {
  airport: string;
  plannedRunway: string;
  wind: string;
  temperature: string;
  altimeter: string;
  surface: string;
  weight: number | null;
  runways: TlrRunway[];
}

export interface FlightPlan {
  id: string;
  generatedAt: number | null; // unix seconds
  airac: string;
  units: 'kgs' | 'lbs';
  callsign: string;
  flightNumber: string;
  airline: string;
  aircraft: { icao: string; name: string; reg: string; selcal: string };
  origin: Airport;
  destination: Airport;
  alternates: Airport[];
  route: string;
  atcRoute: string;
  atcFlightPlan: string;
  cruiseAlt: number | null;
  costIndex: string;
  cruiseProfile: string;
  airDistance: number | null;
  gcDistance: number | null;
  routeDistance: number | null;
  avgWindComp: number | null;
  avgWind: string;
  passengers: number | null;
  times: {
    schedOut: number | null;
    schedOff: number | null;
    schedOn: number | null;
    schedIn: number | null;
    estOut: number | null;
    estOff: number | null;
    estOn: number | null;
    estIn: number | null;
    ete: number | null;
    block: number | null;
  };
  fuel: {
    taxi: number | null;
    trip: number | null;
    contingency: number | null;
    alternate: number | null;
    reserve: number | null;
    extra: number | null;
    minTakeoff: number | null;
    planTakeoff: number | null;
    planRamp: number | null;
    planLanding: number | null;
    avgFlow: number | null;
    maxTanks: number | null;
  };
  weights: {
    oew: number | null;
    paxCount: number | null;
    bagCount: number | null;
    paxWeight: number | null;
    cargo: number | null;
    payload: number | null;
    zfw: number | null;
    maxZfw: number | null;
    tow: number | null;
    maxTow: number | null;
    ldw: number | null;
    maxLdw: number | null;
    ramp: number | null;
  };
  navlog: Fix[];
  ofpHtml: string;
  pdfUrl: string;
  mapImages: { name: string; url: string }[];
  takeoff: TlrSection | null;
  landing: TlrSection | null;
  remarks: string[];
}

export class SimbriefError extends Error {}

/** Read a scalar from SimBrief JSON (empty nodes come through as `{}`). */
function s(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return '';
  return String(v).trim();
}

function n(v: unknown): number | null {
  const str = s(v);
  if (str === '') return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function arr<T = Raw>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object' && Object.keys(v).length) return [v as T];
  return [];
}

function airport(a: Raw | undefined): Airport {
  a = a ?? {};
  return {
    icao: s(a.icao_code),
    iata: s(a.iata_code),
    name: s(a.name),
    runway: s(a.plan_rwy),
    elevation: n(a.elevation),
    lat: n(a.pos_lat),
    lon: n(a.pos_long),
    transAlt: n(a.trans_alt),
    transLevel: n(a.trans_level),
    metar: s(a.metar),
    taf: s(a.taf),
  };
}

function tlrSection(t: Raw | undefined, landing: boolean): TlrSection | null {
  if (!t || typeof t !== 'object') return null;
  const c: Raw = t.conditions ?? {};
  const runways = arr(t.runway).map((r) => ({
    ident: s(r.identifier),
    length: n(landing ? r.length : r.length_tora ?? r.length),
    flaps: s(r.flap_setting),
    thrust: s(r.thrust_setting),
    flexTemp: n(r.flex_temperature),
    v1: n(r.speeds_v1),
    vr: n(r.speeds_vr),
    v2: n(r.speeds_v2),
    vref: n(r.speeds_vref),
    maxWeight: n(landing ? r.max_weight_dry : r.max_weight),
    headwind: n(r.headwind_component),
    crosswind: n(r.crosswind_component),
    magCourse: n(r.magnetic_course),
    distanceRequired: n(landing ? r.actual_distance : r.distance_decide),
  }));
  if (!runways.length && !s(c.airport_icao)) return null;
  const wind = s(c.wind_direction) ? `${s(c.wind_direction).padStart(3, '0')}/${s(c.wind_speed)}` : '';
  return {
    airport: s(c.airport_icao),
    plannedRunway: s(c.planned_runway),
    wind,
    temperature: s(c.temperature),
    altimeter: s(c.altimeter),
    surface: s(c.surface_condition),
    weight: n(landing ? c.planned_weight : c.planned_weight),
    runways,
  };
}

export function normalise(raw: Raw): FlightPlan {
  const g: Raw = raw.general ?? {};
  const t: Raw = raw.times ?? {};
  const f: Raw = raw.fuel ?? {};
  const w: Raw = raw.weights ?? {};
  const ac: Raw = raw.aircraft ?? {};
  const atc: Raw = raw.atc ?? {};
  const files: Raw = raw.files ?? {};
  const images: Raw = raw.images ?? {};
  const wx: Raw = raw.weather ?? {};

  const origin = airport(raw.origin);
  const destination = airport(raw.destination);
  const alternates = arr(raw.alternate).map(airport).filter((a) => a.icao);

  // Older OFPs only carry the METARs/TAFs in the `weather` block.
  origin.metar ||= s(wx.orig_metar);
  origin.taf ||= s(wx.orig_taf);
  destination.metar ||= s(wx.dest_metar);
  destination.taf ||= s(wx.dest_taf);
  if (alternates[0]) {
    alternates[0].metar ||= s(wx.altn_metar);
    alternates[0].taf ||= s(wx.altn_taf);
  }

  const navlog: Fix[] = arr(raw.navlog?.fix).map((x) => ({
    ident: s(x.ident),
    name: s(x.name),
    type: s(x.type),
    via: s(x.via_airway),
    stage: s(x.stage),
    isSidStar: s(x.is_sid_star) === '1',
    lat: n(x.pos_lat),
    lon: n(x.pos_long),
    altitude: n(x.altitude_feet),
    windDir: n(x.wind_dir),
    windSpd: n(x.wind_spd),
    oat: n(x.oat),
    trackMag: n(x.track_mag),
    legDistance: n(x.distance),
    totalDistance: null,
    legTime: n(x.time_leg),
    totalTime: n(x.time_total),
    fuelOnboard: n(x.fuel_plan_onboard),
    fuelUsed: n(x.fuel_totalused),
    mach: s(x.mach),
    ias: n(x.ind_airspeed),
    tas: n(x.true_airspeed),
    gs: n(x.groundspeed),
    frequency: s(x.frequency),
  }));
  let cum = 0;
  for (const fix of navlog) {
    cum += fix.legDistance ?? 0;
    fix.totalDistance = cum;
  }

  const fileDir = s(files.directory);
  const pdfLink = s(files.pdf?.link);
  const imgDir = s(images.directory);
  const mapImages = arr(images.map)
    .map((m) => ({ name: s(m.name), url: imgDir + s(m.link) }))
    .filter((m) => m.url && s(m.url) !== imgDir);

  const units = s(raw.params?.units).toLowerCase().startsWith('l') ? 'lbs' : 'kgs';
  const tlr: Raw = raw.tlr ?? {};

  return {
    id: s(raw.params?.request_id) || s(raw.params?.static_id) || s(raw.params?.time_generated),
    generatedAt: n(raw.params?.time_generated),
    airac: s(raw.params?.airac),
    units,
    callsign: s(atc.callsign),
    flightNumber: s(g.icao_airline) + s(g.flight_number),
    airline: s(g.icao_airline),
    aircraft: { icao: s(ac.icaocode), name: s(ac.name), reg: s(ac.reg), selcal: s(ac.selcal) },
    origin,
    destination,
    alternates,
    route: s(g.route),
    atcRoute: s(atc.route),
    atcFlightPlan: s(atc.flightplan_text),
    cruiseAlt: n(g.initial_altitude),
    costIndex: s(g.costindex),
    cruiseProfile: s(g.cruise_profile),
    airDistance: n(g.air_distance),
    gcDistance: n(g.gc_distance),
    routeDistance: n(g.route_distance),
    avgWindComp: n(g.avg_wind_comp),
    avgWind: s(g.avg_wind_dir) ? `${s(g.avg_wind_dir).padStart(3, '0')}/${s(g.avg_wind_spd).padStart(3, '0')}` : '',
    passengers: n(g.passengers ?? w.pax_count),
    times: {
      schedOut: n(t.sched_out),
      schedOff: n(t.sched_off),
      schedOn: n(t.sched_on),
      schedIn: n(t.sched_in),
      estOut: n(t.est_out),
      estOff: n(t.est_off),
      estOn: n(t.est_on),
      estIn: n(t.est_in),
      ete: n(t.est_time_enroute),
      block: n(t.est_block),
    },
    fuel: {
      taxi: n(f.taxi),
      trip: n(f.enroute_burn),
      contingency: n(f.contingency),
      alternate: n(f.alternate_burn),
      reserve: n(f.reserve),
      extra: n(f.extra),
      minTakeoff: n(f.min_takeoff),
      planTakeoff: n(f.plan_takeoff),
      planRamp: n(f.plan_ramp),
      planLanding: n(f.plan_landing),
      avgFlow: n(f.avg_fuel_flow),
      maxTanks: n(f.max_tanks),
    },
    weights: {
      oew: n(w.oew),
      paxCount: n(w.pax_count),
      bagCount: n(w.bag_count),
      paxWeight: n(w.pax_weight),
      cargo: n(w.cargo),
      payload: n(w.payload),
      zfw: n(w.est_zfw),
      maxZfw: n(w.max_zfw),
      tow: n(w.est_tow),
      maxTow: n(w.max_tow),
      ldw: n(w.est_ldw),
      maxLdw: n(w.max_ldw),
      ramp: n(w.est_ramp),
    },
    navlog,
    ofpHtml: s(raw.text?.plan_html),
    pdfUrl: fileDir && pdfLink ? fileDir + pdfLink : '',
    mapImages,
    takeoff: tlrSection(tlr.takeoff, false),
    landing: tlrSection(tlr.landing, true),
    remarks: arr<string>(g.dx_rmk).map(s).filter(Boolean),
  };
}

/** Fetch the latest OFP. `user` may be a SimBrief username or numeric Pilot ID. */
export async function fetchLatestOfp(user: string): Promise<FlightPlan> {
  const u = user.trim();
  if (!u) throw new SimbriefError('Enter your SimBrief username or Pilot ID in Settings.');
  const param = /^\d+$/.test(u) ? 'userid' : 'username';
  const url = apiUrl('simbrief', `/api/xml.fetcher.php?${param}=${encodeURIComponent(u)}&json=1&v=${Date.now()}`);

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new SimbriefError('Could not reach SimBrief. Check your internet connection.');
  }
  let body: Raw;
  try {
    body = await res.json();
  } catch {
    throw new SimbriefError(`SimBrief returned an unexpected response (HTTP ${res.status}).`);
  }
  const status = s(body?.fetch?.status);
  if (!res.ok || (status && status.toLowerCase() !== 'success')) {
    throw new SimbriefError(status ? `SimBrief: ${status.replace(/^Error:\s*/i, '')}` : `SimBrief error (HTTP ${res.status}).`);
  }
  return normalise(body);
}

/** Link to generate a new flight on SimBrief, pre-filled where possible. */
export function simbriefDispatchUrl(plan?: FlightPlan | null): string {
  if (!plan) return 'https://dispatch.simbrief.com/options/custom';
  const q = new URLSearchParams({
    orig: plan.origin.icao,
    dest: plan.destination.icao,
    type: plan.aircraft.icao,
  });
  return `https://dispatch.simbrief.com/options/custom?${q}`;
}
