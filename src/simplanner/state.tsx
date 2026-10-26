// App state: what you've stored, the airport index, and the live plan
// computed from the current flight inputs.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AirportIndex, type Airport, type AirportDataset } from './lib/airports';
import { DEFAULT_TEMPLATES, renderTemplate, templateVars } from './lib/fmc';
import { distanceNm } from './lib/geo';
import { ROUTE_LIBRARY_KEY, type RouteLibrary } from './lib/caac';
import { idbDelete, idbGet, idbSet } from './lib/idb';
import { customWaypointProvider, type NavFix } from './lib/navdata';
import { computePlan, defaultTaxiFuel, type PlanResult } from './lib/planning';
import { DEFAULT_PROFILES, type AircraftProfile } from './lib/profiles';
import { parseRoute, type ParsedRoute } from './lib/route';
import { loadStore, saveKey, type FlightInputs, type StoreData } from './lib/store';
import { convertWeight, type WeightUnit } from './lib/units';

export const DATASET_KEY = 'ourairports';

export function defaultInputs(p: AircraftProfile): FlightInputs {
  return {
    profileId: p.id,
    variant: p.variants ? Object.keys(p.variants)[0] : undefined,
    units: undefined,
    cruiseFl: p.defaults.cruiseFl,
    paxCount: Math.round(p.capacity.maxPax * 0.8),
    cargo: 0,
    paxWeight: p.defaults.paxWeight,
    contingencyPct: p.reserves.contingencyPct,
    reserveMin: p.reserves.finalReserveMin,
    taxiFuel: defaultTaxiFuel(p),
    extraFuel: 0,
    windKt: 0,
    costIndex: p.defaults.costIndex,
    dep: '',
    arr: '',
    altn: '',
    route: '',
    depRwy: '',
    arrRwy: '',
    flightNo: '',
    routeMode: 'navaids',
    autoCruise: true,
    autoAlternate: true,
    autoRunways: true,
    loadMode: 'random',
  };
}

/** Fill in fields that flights saved by older versions don't have. */
export function withDefaults(i: Partial<FlightInputs>, p: AircraftProfile): FlightInputs {
  return { ...defaultInputs(p), ...i };
}

export const minRunway = (p: AircraftProfile) => p.defaults.minRunwayFt ?? 6500;

export interface Derived {
  profile: AircraftProfile;
  units: WeightUnit;
  dep: Airport | null;
  arr: Airport | null;
  altn: Airport | null;
  route: ParsedRoute;
  plan: PlanResult;
  fmcText: string;
}

interface Ctx {
  store: StoreData;
  update: <K extends keyof StoreData>(key: K, value: StoreData[K]) => void;
  replaceStore: (next: StoreData) => void;
  dataset: AirportDataset | null;
  datasetLoading: boolean;
  datasetError: string;
  /** Your imported CAAC route lists (this browser only). */
  routeLibrary: RouteLibrary | null;
  setRouteLibrary: (lib: RouteLibrary | null) => void;
  index: AirportIndex;
  profiles: AircraftProfile[];
  templates: Record<string, string>;
  inputs: FlightInputs;
  setInputs: (i: FlightInputs) => void;
  changeProfile: (id: string) => void;
  changeUnits: (u: WeightUnit | undefined) => void;
  derived: Derived;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreData>(() => loadStore());
  const [dataset, setDataset] = useState<AirportDataset | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(true);

  const [datasetError, setDatasetError] = useState('');
  const [routeLibrary, setLibraryState] = useState<RouteLibrary | null>(null);

  useEffect(() => {
    idbGet<RouteLibrary>(ROUTE_LIBRARY_KEY).then((l) => l && setLibraryState(l)).catch(() => undefined);
  }, []);

  const setRouteLibrary = useCallback((lib: RouteLibrary | null) => {
    setLibraryState(lib);
    (lib ? idbSet(ROUTE_LIBRARY_KEY, lib) : idbDelete(ROUTE_LIBRARY_KEY)).catch(() => undefined);
  }, []);

  // Airport data ships with the website (public/data, kept up to date by a
  // GitHub Action). A copy is kept in the browser so it also works offline.
  useEffect(() => {
    let cancelled = false;
    const cached = idbGet<AirportDataset>(DATASET_KEY).catch(() => undefined);
    cached.then((d) => {
      if (!cancelled && d) setDataset(d);
    });
    fetch(`${import.meta.env.BASE_URL}data/ourairports.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AirportDataset>;
      })
      .then(async (d) => {
        if (cancelled) return;
        setDataset(d);
        setDatasetError('');
        const old = await cached;
        if (old?.importedAt !== d.importedAt) await idbSet(DATASET_KEY, d).catch(() => undefined);
      })
      .catch(async (e: Error) => {
        if (cancelled) return;
        setDatasetError((await cached) ? `Using the copy saved in this browser (couldn't reach the site's data: ${e.message}).` : `Airport data couldn't be loaded (${e.message}). Your own airports still work.`);
      })
      .finally(() => !cancelled && setDatasetLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(<K extends keyof StoreData>(key: K, value: StoreData[K]) => {
    setStore((s) => ({ ...s, [key]: value }));
    saveKey(key, value);
  }, []);

  const replaceStore = useCallback((next: StoreData) => {
    setStore(next);
    (Object.keys(next) as (keyof StoreData)[]).forEach((k) => saveKey(k, next[k]));
  }, []);

  const profiles = useMemo(() => {
    const merged = DEFAULT_PROFILES.map((p) => store.profiles[p.id] ?? p);
    const extra = Object.values(store.profiles).filter((p) => !DEFAULT_PROFILES.some((d) => d.id === p.id));
    return [...merged, ...extra];
  }, [store.profiles]);

  const templates = useMemo(() => ({ ...DEFAULT_TEMPLATES, ...store.templates }), [store.templates]);
  const index = useMemo(() => new AirportIndex(dataset, store.airports), [dataset, store.airports]);

  // New flights start on the PMDG 737-800 if it's there, else the first profile.
  const firstProfile = profiles.find((p) => p.id === 'pmdg-737-800') ?? profiles[0];
  const inputs = store.draft ? withDefaults(store.draft, profiles.find((p) => p.id === store.draft!.profileId) ?? firstProfile) : defaultInputs(firstProfile);
  const setInputs = useCallback((i: FlightInputs) => update('draft', i), [update]);

  const profileFor = (id: string) => profiles.find((p) => p.id === id) ?? profiles[0];

  const changeProfile = (id: string) => {
    const p = profileFor(id);
    const d = defaultInputs(p);
    // Keep the flight itself; reset the aircraft-specific numbers to the new profile.
    setInputs({
      ...d,
      dep: inputs.dep, arr: inputs.arr, altn: inputs.altn, route: inputs.route, depRwy: inputs.depRwy, arrRwy: inputs.arrRwy, flightNo: inputs.flightNo,
      routeMode: inputs.routeMode, autoCruise: inputs.autoCruise, autoAlternate: inputs.autoAlternate, autoRunways: inputs.autoRunways, loadMode: inputs.loadMode, publishedRoute: inputs.publishedRoute,
      paxCount: Math.min(inputs.paxCount, p.capacity.maxPax),
    });
  };

  const changeUnits = (u: WeightUnit | undefined) => {
    const from = inputs.units ?? profileFor(inputs.profileId).units;
    const to = u ?? profileFor(inputs.profileId).units;
    const c = (v: number) => Math.round(convertWeight(v, from, to));
    setInputs({ ...inputs, units: u, cargo: c(inputs.cargo), paxWeight: c(inputs.paxWeight), taxiFuel: c(inputs.taxiFuel), extraFuel: c(inputs.extraFuel) });
  };

  const derived = useMemo<Derived>(() => {
    const profile = profileFor(inputs.profileId);
    const dep = inputs.dep ? index.get(inputs.dep) : null;
    const arr = inputs.arr ? index.get(inputs.arr) : null;
    const altn = inputs.altn ? index.get(inputs.altn) : null;
    const providers = [customWaypointProvider(store.waypoints), index.provider(), index.navaidProvider()];
    const fix = (a: Airport | null): NavFix | null => (a ? index.toFix(a) : null);
    const route = parseRoute(inputs.route, providers, fix(dep), fix(arr));
    const altnNm = arr && altn ? distanceNm(arr, altn) : 0;
    const plan = computePlan(inputs, profile, route.totalNm, altnNm, { dep: dep?.elevationFt, arr: arr?.elevationFt, altn: altn?.elevationFt });
    // Airport checks the fuel model can't see.
    const minRwy = minRunway(profile);
    for (const [role, a, rwy] of [['Departure', dep, inputs.depRwy], ['Arrival', arr, inputs.arrRwy], ['Alternate', altn, '']] as const) {
      if (!a) continue;
      const len = rwy ? a.runways.find((r) => r.ident === rwy)?.lengthFt : Math.max(0, ...a.runways.map((r) => r.lengthFt ?? 0));
      if (len && len < minRwy) {
        const which = rwy ? `runway ${rwy}` : 'longest runway';
        plan.warnings.unshift(`${role} ${a.icao}: ${which} is ${len.toLocaleString('en-US')} ft, shorter than the ${minRwy.toLocaleString('en-US')} ft this aircraft profile needs.`);
      }
      if (!a.runways.length) plan.warnings.push(`${role} ${a.icao}: no runway data. Check the runway length yourself.`);
      if ((a.elevationFt ?? 0) >= 8000) plan.warnings.push(`${role} ${a.icao} is a high-elevation airport (${Math.round(a.elevationFt!).toLocaleString('en-US')} ft): takeoff/landing performance and weight limits there are much tighter. Check with the aircraft's own performance tool.`);
    }
    if (inputs.altn && !altn) plan.warnings.push(`Alternate ${inputs.altn.toUpperCase()} not found: alternate fuel is 0.`);
    const fmcText = renderTemplate(templates[profile.fmcTemplate] ?? `No FMC template "${profile.fmcTemplate}".`, templateVars(inputs, plan, route, profile.name));
    return { profile, units: plan.units, dep, arr, altn, route, plan, fmcText };
  }, [inputs, index, store.waypoints, profiles, templates]);

  const value: Ctx = {
    store, update, replaceStore, dataset, datasetLoading, datasetError, routeLibrary, setRouteLibrary, index, profiles, templates,
    inputs, setInputs, changeProfile, changeUnits, derived,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
