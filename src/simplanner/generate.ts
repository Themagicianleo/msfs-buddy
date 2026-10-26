// "Generate flight": fills in whatever is set to automatic (route, cruise
// level, alternate, runways, payload), like SimBrief's dispatch. Pure apart
// from the weather fetch and the random numbers, which are injected so it can
// be tested.

import { parseMetar } from '../lib/metar';
import type { AirportIndex } from './lib/airports';
import { generateRoute, minimumCruiseFl, pickRunway, suggestAlternates, suggestCruiseFl } from './lib/autoplan';
import { describeLoad, fitPayload, randomPayload, type Rng } from './lib/payload';
import { distanceNm, initialCourseTrue } from './lib/geo';
import type { AircraftProfile } from './lib/profiles';
import type { FlightInputs } from './lib/store';
import { getWeather } from './lib/weather';

export interface GenerateResult {
  inputs: FlightInputs;
  errors: string[];
  notes: string[];
}

type WeatherFn = (ids: string[]) => Promise<{ stations: Record<string, { metar: string }> }>;

export async function generateFlight(
  inputs: FlightInputs,
  profile: AircraftProfile,
  index: AirportIndex,
  weather: WeatherFn = getWeather,
  rng: Rng = Math.random,
): Promise<GenerateResult> {
  const errors: string[] = [];
  const notes: string[] = [];
  const dep = index.get(inputs.dep);
  const arr = index.get(inputs.arr);
  if (!inputs.dep) errors.push('Enter a departure airport.');
  else if (!dep) errors.push(`Departure ${inputs.dep} isn't in the airport data. Add it under Airports.`);
  if (!inputs.arr) errors.push('Enter an arrival airport.');
  else if (!arr) errors.push(`Arrival ${inputs.arr} isn't in the airport data. Add it under Airports.`);
  if (dep && arr && dep.icao === arr.icao) errors.push('Departure and arrival are the same airport.');
  if (errors.length || !dep || !arr) return { inputs, errors, notes };

  const next: FlightInputs = { ...inputs, dep: dep.icao, arr: arr.icao };
  const minRwy = profile.defaults.minRunwayFt ?? 6500;

  // Estimated route length, for the cruise level and payload limits.
  let routeNm = distanceNm(dep, arr) * 1.05;
  if (inputs.routeMode !== 'manual') {
    const r = generateRoute(dep, arr, index.navaids, inputs.routeMode);
    next.route = r.route;
    next.routeNote = r.note;
    routeNm = r.routeNm;
    notes.push(`Route: ${r.note}`);
  } else {
    next.routeNote = 'Route entered by hand.';
  }

  if (inputs.autoCruise) {
    const course = initialCourseTrue(dep, arr);
    const minFl = minimumCruiseFl(dep.elevationFt, arr.elevationFt);
    next.cruiseFl = suggestCruiseFl(distanceNm(dep, arr), course, profile.defaults.cruiseFl, minFl);
    const high = minFl > 100 + distanceNm(dep, arr) * 0.75 ? `, at least FL${minFl} because of the airport elevations` : '';
    notes.push(`Cruise level FL${next.cruiseFl}: by distance and the ${course < 180 ? 'eastbound (odd)' : 'westbound (even)'} rule${high}.`);
  }

  if (inputs.autoAlternate) {
    const alts = suggestAlternates(index, arr, minRwy);
    if (alts[0]) {
      next.altn = alts[0].airport.icao;
      notes.push(`Alternate ${alts[0].airport.icao} (${alts[0].airport.name}), ${Math.round(alts[0].distanceNm)} nm from ${arr.icao}.`);
    } else {
      next.altn = '';
      notes.push(`No alternate found within 300 nm of ${arr.icao} with a ${minRwy.toLocaleString('en-US')} ft runway; set one by hand.`);
    }
  }

  if (inputs.loadMode === 'random') {
    const altn = next.altn ? index.get(next.altn) : null;
    const rolled = randomPayload(profile, next, rng);
    const fit = fitPayload({ ...next, ...rolled }, profile, routeNm, altn ? distanceNm(arr, altn) : 0, {
      dep: dep.elevationFt,
      arr: arr.elevationFt,
      altn: altn?.elevationFt,
    });
    next.paxCount = fit.paxCount;
    next.cargo = fit.cargo;
    next.loadNote = describeLoad(fit.paxCount, fit.cargo, profile.capacity.maxPax, next.units ?? profile.units, fit.trimmed);
    notes.push(next.loadNote);
  } else {
    next.loadNote = undefined;
  }

  if (inputs.autoRunways) {
    let stations: Record<string, { metar: string }> = {};
    try {
      stations = (await weather([dep.icao, arr.icao])).stations;
    } catch {
      stations = {};
    }
    const wind = (icao: string) => {
      const raw = stations[icao]?.metar;
      const w = raw ? parseMetar(raw).wind : null;
      if (!w) return null;
      const kt = w.unit === 'MPS' ? Math.round(w.speed * 1.944) : w.speed;
      return { dir: w.dir, speed: kt };
    };
    const d = pickRunway(dep, wind(dep.icao), minRwy);
    const a = pickRunway(arr, wind(arr.icao), minRwy);
    next.depRwy = d.runway?.ident ?? '';
    next.arrRwy = a.runway?.ident ?? '';
    next.runwayNotes = `${dep.icao} ${next.depRwy || '—'}: ${d.reason}. ${arr.icao} ${next.arrRwy || '—'}: ${a.reason}.`;
    notes.push(`Runways: ${next.runwayNotes}`);
  }

  return { inputs: next, errors, notes };
}
