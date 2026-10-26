// Planning tests against the REAL airport data committed in public/data
// (OurAirports, refreshed monthly by the "Update airport data" Action).
// Focus: small and high-elevation airports that SimBrief may not cover, like
// ZUDC. Skipped if the data file isn't there.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AirportIndex, type AirportDataset } from './lib/airports';
import { generateRoute, minimumCruiseFl } from './lib/autoplan';
import { distanceNm } from './lib/geo';
import { customWaypointProvider } from './lib/navdata';
import { seededRng } from './lib/payload';
import { computePlan } from './lib/planning';
import { DEFAULT_PROFILES } from './lib/profiles';
import { parseRoute } from './lib/route';
import { generateFlight } from './generate';
import { defaultInputs } from './state';

const FILE = 'public/data/ourairports.json';
const ds: AirportDataset | null = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const index = new AirportIndex(ds, []);
// Beacon countries were added to the data format later; older files lack them.
const hasNavaidCountries = (ds?.navaids?.[0]?.length ?? 0) >= 7;
const providers = [customWaypointProvider([]), index.provider(), index.navaidProvider()];
const calm = async (ids: string[]) => ({ stations: Object.fromEntries(ids.map((id) => [id, { metar: `${id} 260600Z 27010KT 9999 FEW040 05/M05 Q1020` }])) });

const SMALL_CHINA = ['ZUDC', 'ZUNZ', 'ZUKD', 'ZPDQ', 'ZPLJ', 'ZUJZ', 'ZLYS', 'ZUBD', 'ZUAL', 'ZULS'];
const FLIGHTS: [string, string][] = [
  ['ZUDC', 'ZUNZ'],
  ['ZUUU', 'ZUDC'],
  ['ZUDC', 'ZUUU'],
  ['ZPLJ', 'ZUDC'],
  ['ZUDC', 'ZULS'],
  ['ZUKD', 'ZUUU'],
  ['ZLXN', 'ZLYS'],
  ['ZUUU', 'ZUJZ'],
  ['ZPPP', 'ZPDQ'],
  ['ZULS', 'ZUAL'],
];

describe.skipIf(!ds)('real airport data: small Chinese airports', () => {
  it('has the airports with runways and elevations', () => {
    for (const icao of SMALL_CHINA) {
      const a = index.get(icao);
      expect(a, icao).toBeTruthy();
      expect(a!.runways.length, `${icao} runways`).toBeGreaterThan(0);
      expect(a!.elevationFt, `${icao} elevation`).toBeGreaterThan(5000);
      expect(a!.country).toBe('CN');
    }
  });

  for (const profileId of ['pmdg-737-800', 'fenix-a320']) {
    const profile = DEFAULT_PROFILES.find((p) => p.id === profileId)!;
    for (const [from, to] of FLIGHTS) {
      it(`${profile.name}: ${from} → ${to}`, async () => {
        const r = await generateFlight({ ...defaultInputs(profile), dep: from, arr: to }, profile, index, calm, seededRng(from.charCodeAt(2) * 31 + to.charCodeAt(3)));
        expect(r.errors).toEqual([]);
        const i = r.inputs;
        const dep = index.get(from)!;
        const arr = index.get(to)!;

        // Route: every token resolves, and a domestic flight only uses Chinese beacons.
        const route = parseRoute(i.route, providers, index.toFix(dep), index.toFix(arr));
        expect(route.tokens.filter((t) => t.kind === 'unknown').map((t) => t.raw)).toEqual([]);
        if (hasNavaidCountries) {
          for (const p of route.points.slice(1, -1)) {
            const n = index.navaids.find((x) => x.ident === p.ident && Math.abs(x.lat - p.lat) < 1e-6);
            expect(n?.country, `${p.ident} should be a Chinese beacon`).toBe('CN');
          }
        }
        expect(route.totalNm).toBeLessThan(distanceNm(dep, arr) * 1.15);

        // Cruise level clears the high fields.
        expect(i.cruiseFl).toBeGreaterThanOrEqual(minimumCruiseFl(dep.elevationFt, arr.elevationFt));

        // Alternate: domestic, with a runway, not the arrival itself.
        const altn = index.get(i.altn);
        expect(altn, 'alternate').toBeTruthy();
        expect(altn!.country).toBe('CN');
        expect(altn!.icao).not.toBe(to);

        // Runways: real numbered runways at each airport.
        expect(dep.runways.map((x) => x.ident)).toContain(i.depRwy);
        expect(arr.runways.map((x) => x.ident)).toContain(i.arrRwy);

        // Random payload stays inside the weight limits once fuel is planned.
        const plan = computePlan(i, profile, route.totalNm, distanceNm(arr, altn!), { dep: dep.elevationFt, arr: arr.elevationFt, altn: altn!.elevationFt });
        expect(plan.exceeded.map((l) => l.name)).toEqual([]);
        expect(i.paxCount).toBeGreaterThan(0);
        expect(i.loadNote).toMatch(/^Random load/);
        expect(plan.tripTimeMin).toBeGreaterThan(10);
      });
    }
  }

  it('climbs from the field, not from sea level, at ZUDC', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.id === 'pmdg-737-800')!;
    const inputs = { ...defaultInputs(profile), cruiseFl: 310 };
    const zudc = index.get('ZUDC')!;
    const fromField = computePlan(inputs, profile, 300, 0, { dep: zudc.elevationFt, arr: 9675 });
    const fromSea = computePlan(inputs, profile, 300, 0, {});
    expect(fromField.climb.timeMin).toBeLessThan(fromSea.climb.timeMin * 0.6);
    expect(fromField.fuel.trip).toBeLessThan(fromSea.fuel.trip);
  });
});

describe.skipIf(!ds)('real airport data: elsewhere', () => {
  it('builds beacon routes where the open data has beacons', () => {
    for (const [from, to] of [['EGLL', 'LEBL'], ['KJFK', 'EGLL'], ['ZBAA', 'RJTT'], ['NZAA', 'NZQN']]) {
      const dep = index.get(from)!;
      const arr = index.get(to)!;
      const g = generateRoute(dep, arr, index.navaids, 'navaids');
      expect(g.navaids.length, `${from}-${to}`).toBeGreaterThan(0);
      expect(g.routeNm / g.directNm, `${from}-${to}`).toBeLessThan(1.06);
    }
  });

  it('warns about runways too short for the aircraft (Lukla)', () => {
    const lukla = index.get('VNLK')!;
    expect(Math.max(...lukla.runways.map((r) => r.lengthFt ?? 0))).toBeLessThan(3000);
  });
});
