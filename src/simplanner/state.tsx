// App state: what you've stored, the airport index, and the live plan
// computed from the current flight inputs.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AirportIndex, type Airport, type AirportDataset } from './lib/airports';
import { DEFAULT_TEMPLATES, renderTemplate, templateVars } from './lib/fmc';
import { distanceNm } from './lib/geo';
import { idbGet } from './lib/idb';
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
  };
}

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
  setDataset: (d: AirportDataset | null) => void;
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

  useEffect(() => {
    idbGet<AirportDataset>(DATASET_KEY)
      .then((d) => setDataset(d ?? null))
      .catch(() => setDataset(null))
      .finally(() => setDatasetLoading(false));
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

  const inputs = store.draft ?? defaultInputs(profiles[0]);
  const setInputs = useCallback((i: FlightInputs) => update('draft', i), [update]);

  const profileFor = (id: string) => profiles.find((p) => p.id === id) ?? profiles[0];

  const changeProfile = (id: string) => {
    const p = profileFor(id);
    const d = defaultInputs(p);
    // Keep the flight itself; reset the aircraft-specific numbers to the new profile.
    setInputs({ ...d, dep: inputs.dep, arr: inputs.arr, altn: inputs.altn, route: inputs.route, depRwy: inputs.depRwy, arrRwy: inputs.arrRwy, flightNo: inputs.flightNo, paxCount: Math.min(inputs.paxCount, p.capacity.maxPax) });
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
    const providers = [customWaypointProvider(store.waypoints), index.provider()];
    const fix = (a: Airport | null): NavFix | null => (a ? index.toFix(a) : null);
    const route = parseRoute(inputs.route, providers, fix(dep), fix(arr));
    const altnNm = arr && altn ? distanceNm(arr, altn) : 0;
    const plan = computePlan(inputs, profile, route.totalNm, altnNm);
    if (inputs.altn && !altn) plan.warnings.push(`Alternate ${inputs.altn.toUpperCase()} not found: alternate fuel is 0.`);
    const fmcText = renderTemplate(templates[profile.fmcTemplate] ?? `No FMC template "${profile.fmcTemplate}".`, templateVars(inputs, plan, route, profile.name));
    return { profile, units: plan.units, dep, arr, altn, route, plan, fmcText };
  }, [inputs, index, store.waypoints, profiles, templates]);

  const value: Ctx = {
    store, update, replaceStore, dataset, datasetLoading, setDataset, index, profiles, templates,
    inputs, setInputs, changeProfile, changeUnits, derived,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
