import { describe, expect, it } from 'vitest';
import { AirportIndex, type AirportDataset } from './lib/airports';
import { readFileSync } from 'node:fs';
import { AirwayGraph, extractAirways } from './lib/airways';
import { addLists, parseCaacRoutes } from './lib/caac';
import { bufferSource } from './lib/sqlite';
import { DEFAULT_PROFILES } from './lib/profiles';
import { generateFlight } from './generate';
import { defaultInputs } from './state';

// Test fixture: approximate positions, made-up beacons.
const DS: AirportDataset = {
  importedAt: '2026-10-01T00:00:00Z',
  source: 'test',
  airports: [
    ['ZUDC', 'Daocheng Yading', 29.3233, 100.0533, 14472, 'CN', 'Daocheng', '', 'M'],
    ['ZUNZ', 'Nyingchi Mainling', 29.3033, 94.3353, 9675, 'CN', 'Nyingchi', '', 'M'],
    ['ZULS', 'Lhasa Gonggar', 29.298, 90.912, 11713, 'CN', 'Lhasa', '', 'L'],
  ],
  runways: {
    ZUDC: [['15', 13780, 151, 'ASP'], ['33', 13780, 331, 'ASP']],
    ZUNZ: [['05', 9843, 50, 'ASP'], ['23', 9843, 230, 'ASP']],
    ZULS: [['09', 13123, 88, 'CON'], ['27', 13123, 268, 'CON']],
  },
  navaids: [
    ['AAA', 'Test A', 'VOR-DME', 29.35, 98.4, 'HI'],
    ['BBB', 'Test B', 'VOR-DME', 29.25, 96.4, 'HI'],
  ],
};

describe('generateFlight', () => {
  const profile = DEFAULT_PROFILES.find((p) => p.id === 'pmdg-737-800')!;
  const index = new AirportIndex(DS, []);
  const base = { ...defaultInputs(profile), dep: 'zudc', arr: 'zunz' };

  it('fills in route, cruise level, alternate and runways', async () => {
    const wx = async () => ({ stations: { ZUDC: { metar: 'ZUDC 260600Z 33012KT 9999 FEW040 05/M10 Q1020' }, ZUNZ: { metar: 'ZUNZ 260600Z 23008KT CAVOK 12/M02 Q1018' } } });
    const r = await generateFlight(base, profile, index, { weather: wx });
    expect(r.errors).toEqual([]);
    expect(r.inputs.dep).toBe('ZUDC');
    expect(r.inputs.route).toBe('BBB'); // ~300 nm: one beacon roughly mid-way is enough
    expect(r.inputs.altn).toBe('ZULS');
    expect(r.inputs.depRwy).toBe('33'); // into the 330° wind
    expect(r.inputs.arrRwy).toBe('23');
    expect(r.inputs.cruiseFl % 20).toBe(0); // westbound: even level
    expect(r.notes.join(' ')).toMatch(/VOR-to-VOR/);
  });

  it('uses the longest runway when weather is unavailable', async () => {
    const r = await generateFlight(base, profile, index, {
      weather: async () => {
        throw new Error('offline');
      },
    });
    expect(r.inputs.depRwy).toBe('15');
    expect(r.inputs.runwayNotes).toMatch(/no current wind/);
  });

  it('keeps manual choices', async () => {
    const r = await generateFlight({ ...base, routeMode: 'manual', route: 'MYFIX', autoCruise: false, cruiseFl: 290, autoAlternate: false, altn: 'ZUUU', autoRunways: false, depRwy: '15' }, profile, index);
    expect(r.inputs.route).toBe('MYFIX');
    expect(r.inputs.cruiseFl).toBe(290);
    expect(r.inputs.altn).toBe('ZUUU');
    expect(r.inputs.depRwy).toBe('15');
  });

  it('uses a CAAC published route when one is imported for the pair', async () => {
    const lib = addLists(null, [parseCaacRoutes('Flight Routes for Regional Flight Routes Nr2610 (EFF202609301600UTC),\nRoute Code,Fly along,\nZUDC-ZUNZ-01,AAA W1 BBB,\nZUDC-ZUNZ-02,BBB,\n')]);
    const wx = async () => ({ stations: {} });
    const r = await generateFlight(base, profile, index, { weather: wx, library: lib });
    expect(r.inputs.route).toBe('AAA W1 BBB');
    expect(r.inputs.routeNote).toMatch(/ZUDC-ZUNZ-01 \(cycle 2610\).*other published option: ZUDC-ZUNZ-02/);
    expect((await generateFlight({ ...base, publishedRoute: 'ZUDC-ZUNZ-02' }, profile, index, { weather: wx, library: lib })).inputs.route).toBe('BBB');
    expect((await generateFlight({ ...base, publishedRoute: 'off' }, profile, index, { weather: wx, library: lib })).inputs.routeNote).toMatch(/VOR-to-VOR/);
    expect((await generateFlight({ ...base, routeMode: 'direct' }, profile, index, { weather: wx, library: lib })).inputs.route).toBe('DCT');
  });

  it('routes along airways when airway data is loaded, else falls back to VOR to VOR', async () => {
    const file = new Uint8Array(readFileSync(new URL('./lib/fixtures/airways.sqlite', import.meta.url)));
    const airways = new AirwayGraph(await extractAirways(bufferSource(file), 'airways.sqlite'));
    const wx = async () => ({ stations: {} });
    expect(base.routeMode).toBe('airways');
    const r = await generateFlight(base, profile, index, { weather: wx, airways });
    expect(r.inputs.route).toBe('TSTAB T1 TVR T2 TSTAF');
    expect(r.inputs.routeNote).toMatch(/Airway route from your MSFS24 cycle 2610 navdata via T1, T2/);
    const none = await generateFlight(base, profile, index, { weather: wx });
    expect(none.inputs.route).toBe('BBB');
    expect(none.inputs.routeNote).toMatch(/^No airway data loaded/);
  });

  it('explains missing airports', async () => {
    const r = await generateFlight({ ...base, dep: 'XXXX', arr: '' }, profile, index);
    expect(r.errors).toEqual(["Departure XXXX isn't in the airport data. Add it under Airports.", 'Enter an arrival airport.']);
  });
});
