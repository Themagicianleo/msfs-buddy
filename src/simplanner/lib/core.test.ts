import { describe, expect, it } from 'vitest';
import { distanceNm, initialCourseTrue, parseCoordinate, toDms } from './geo';
import { customWaypointProvider, parseWaypointCsv, type NavDataProvider, type NavFix } from './navdata';
import { parseRoute } from './route';
import { computePlan, defaultTaxiFuel, flightPhases, type PlanInputs } from './planning';
import { DEFAULT_PROFILES, validateProfile, withVariant, type AircraftProfile } from './profiles';
import { convertWeight } from './units';

const apt = (ident: string, lat: number, lon: number): NavFix => ({ ident, lat, lon, type: 'airport', source: 'test' });

describe('geo', () => {
  it('measures great-circle distance', () => {
    // One degree of longitude on the equator = 60.04 nm on a 3440.065 nm sphere.
    expect(distanceNm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(60.04, 1);
    // JFK–LHR is about 2,999 nm great circle.
    expect(distanceNm({ lat: 40.6398, lon: -73.7789 }, { lat: 51.4706, lon: -0.4619 })).toBeGreaterThan(2980);
    expect(distanceNm({ lat: 40.6398, lon: -73.7789 }, { lat: 51.4706, lon: -0.4619 })).toBeLessThan(3010);
  });

  it('gives true initial course', () => {
    expect(initialCourseTrue({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 5);
    expect(initialCourseTrue({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 5);
    expect(initialCourseTrue({ lat: 10, lon: 10 }, { lat: 0, lon: 10 })).toBeCloseTo(180, 5);
  });

  it('parses route coordinates', () => {
    expect(parseCoordinate('4530N11630E')).toEqual({ lat: 45.5, lon: 116.5 });
    expect(parseCoordinate('45N116W')).toEqual({ lat: 45, lon: -116 });
    expect(parseCoordinate('-33.9/151.2')).toEqual({ lat: -33.9, lon: 151.2 });
    expect(parseCoordinate('9530N11630E')).toBeNull();
    expect(parseCoordinate('W5')).toBeNull();
  });

  it('formats DMS for .pln files', () => {
    expect(toDms(40.08, true)).toBe('N40° 4\' 48.00"');
    expect(toDms(-0.5, false)).toBe('W0° 30\' 0.00"');
  });
});

describe('route parser', () => {
  const zbaa = apt('ZBAA', 40.08, 116.584);
  const rjtt = apt('RJTT', 35.552, 139.78);
  const provider = customWaypointProvider([
    { ident: 'WPT1', lat: 39.5, lon: 118.0 },
    { ident: 'WPT2', lat: 37.0, lon: 126.0 },
    { ident: 'DUP', lat: 10, lon: 10 },
    { ident: 'DUP', lat: 39.0, lon: 120.0 },
  ]);

  it('parses the example route', () => {
    const r = parseRoute('ZBAA SID WPT1 W5 WPT2 STAR RJTT', [provider], zbaa, rjtt);
    expect(r.tokens.map((t) => t.kind)).toEqual(['airport', 'sid', 'fix', 'airway', 'fix', 'star', 'airport']);
    expect(r.points.map((p) => p.ident)).toEqual(['ZBAA', 'WPT1', 'WPT2', 'RJTT']);
    expect(r.legs[1].via).toBe('W5');
    const direct = r.legs.reduce((a, l) => a + l.distanceNm, 0);
    expect(r.totalNm).toBeCloseTo(direct, 6);
    expect(r.fmcRoute).toBe('SID WPT1 W5 WPT2 STAR');
    expect(r.warnings.join(' ')).toMatch(/Airway segments are flown direct/);
    expect(r.warnings.join(' ')).toMatch(/SIDs and STARs are not modelled/);
  });

  it('flags unknown fixes and leaves them out', () => {
    const r = parseRoute('NOPE1 WPT1', [provider], zbaa, rjtt);
    expect(r.tokens[0].kind).toBe('unknown');
    expect(r.points.map((p) => p.ident)).toEqual(['ZBAA', 'WPT1', 'RJTT']);
    expect(r.warnings[0]).toMatch(/NOPE1/);
  });

  it('classifies named procedures and coordinates', () => {
    const r = parseRoute('ELKUR1A 4000N12000E DCT WPT2 ABMOK2B', [provider], zbaa, rjtt);
    expect(r.tokens.map((t) => t.kind)).toEqual(['sid', 'coord', 'direct', 'fix', 'star']);
  });

  it('picks the nearest of duplicate idents', () => {
    const r = parseRoute('DUP', [provider], zbaa, rjtt);
    expect(r.points[1].lat).toBe(39.0);
  });

  it('ignores speed/level groups', () => {
    const r = parseRoute('N0450F350 WPT1', [provider], zbaa, rjtt);
    expect(r.tokens[0].kind).toBe('speedlevel');
    expect(r.fmcRoute).toBe('WPT1');
  });

  it('uses an airway provider when one is plugged in', () => {
    const awy: NavDataProvider = {
      id: 'awy',
      name: 'test airways',
      findFix: () => [],
      expandAirway: (a, from, to) => (a === 'W5' && from === 'WPT1' && to === 'WPT2' ? [{ ident: 'MID', lat: 38, lon: 122, type: 'waypoint', source: 'awy' }] : null),
    };
    const r = parseRoute('WPT1 W5 WPT2', [provider, awy], zbaa, rjtt);
    expect(r.points.map((p) => p.ident)).toEqual(['ZBAA', 'WPT1', 'MID', 'WPT2', 'RJTT']);
    expect(r.warnings.join(' ')).not.toMatch(/Airway segments/);
  });

  it('reads waypoint CSV', () => {
    const { waypoints, errors } = parseWaypointCsv('ident,lat,lon,name\nABC12, 30.5, 101.25, Test fix\nbad,line\n');
    expect(waypoints).toEqual([{ ident: 'ABC12', lat: 30.5, lon: 101.25, name: 'Test fix' }]);
    expect(errors).toHaveLength(1);
  });
});

/** A simple hand-checkable profile: numbers chosen to make the arithmetic easy. */
const TEST_PROFILE: AircraftProfile = {
  id: 'test',
  name: 'Test jet',
  fmcTemplate: 'pmdg-737',
  units: 'kg',
  verified: true,
  placeholderNotice: '',
  weights: { oew: 40000, mtow: 70000, mlw: 60000, mzfw: 58000, maxFuel: 20000 },
  capacity: { maxPax: 180, maxCargo: 3000 },
  defaults: { paxWeight: 100, costIndex: 30, cruiseFl: 300, taxiMinutes: 12 },
  performance: {
    cruiseTasKt: 450,
    climbRateFpm: 2000,
    climbSpeedKt: 300,
    descentNmPer1000ft: 3,
    descentSpeedKt: 300,
    burnPerHour: { taxi: 600, climb: 6000, cruise: 3000, descent: 1200, holding: 2400 },
  },
  reserves: { contingencyPct: 5, minContingencyMin: 5, finalReserveMin: 30, alternateCruiseFl: 100 },
  vspeedNotes: '',
  notes: '',
};

const INPUTS: PlanInputs = {
  profileId: 'test',
  cruiseFl: 300,
  paxCount: 150,
  cargo: 1000,
  paxWeight: 100,
  contingencyPct: 5,
  reserveMin: 30,
  taxiFuel: 200,
  extraFuel: 0,
  windKt: 0,
  costIndex: 30,
};

describe('planning model', () => {
  it('splits a flight into climb, cruise, descent', () => {
    const ph = flightPhases(500, 30000, TEST_PROFILE.performance, 0, 'Trip', []);
    // climb 30000/2000 = 15 min, 15/60*300 = 75 nm; descent 30*3 = 90 nm, 90/300*60 = 18 min
    expect(ph.climb.timeMin).toBeCloseTo(15);
    expect(ph.climb.distanceNm).toBeCloseTo(75);
    expect(ph.descent.distanceNm).toBeCloseTo(90);
    expect(ph.descent.timeMin).toBeCloseTo(18);
    // cruise 500 - 165 = 335 nm at 450 kt = 44.67 min
    expect(ph.cruise.distanceNm).toBeCloseTo(335);
    expect(ph.cruise.timeMin).toBeCloseTo(44.667, 2);
    // fuel 15/60*6000 + 44.667/60*3000 + 18/60*1200 = 1500 + 2233.3 + 360
    expect(ph.climb.fuel + ph.cruise.fuel + ph.descent.fuel).toBeCloseTo(4093.33, 1);
  });

  it('computes fuel and weights by hand-checkable formulas', () => {
    const r = computePlan(INPUTS, TEST_PROFILE, 500, 0);
    expect(r.fuel.trip).toBeCloseTo(4093.33, 1);
    // contingency = max(5% of trip = 204.7, 5 min × 2400/h = 200) = 204.7
    expect(r.fuel.contingency).toBeCloseTo(204.67, 1);
    expect(r.fuel.reserve).toBeCloseTo(1200); // 30 min × 2400/h
    expect(r.fuel.block).toBeCloseTo(200 + 4093.33 + 204.67 + 0 + 1200, 0);
    expect(r.weights.payload).toBe(16000); // 150 × 100 + 1000
    expect(r.weights.zfw).toBe(56000);
    expect(r.weights.tow).toBeCloseTo(56000 + r.fuel.block - 200, 6);
    expect(r.weights.lw).toBeCloseTo(r.weights.tow - r.fuel.trip, 6);
    expect(r.tripTimeMin).toBeCloseTo(15 + 44.667 + 18, 2);
    expect(r.exceeded).toHaveLength(0);
    expect(r.formulas.some((f) => f.startsWith('Block fuel ='))).toBe(true);
  });

  it('uses the minimum contingency when the percentage is smaller', () => {
    const r = computePlan({ ...INPUTS, contingencyPct: 1 }, TEST_PROFILE, 500, 0);
    expect(r.fuel.contingency).toBeCloseTo(200); // 5 min × 2400/h
  });

  it('flags exceeded limits clearly', () => {
    const r = computePlan({ ...INPUTS, paxCount: 200, cargo: 4000 }, TEST_PROFILE, 500, 0);
    const names = r.exceeded.map((l) => l.name);
    expect(names).toContain('Zero fuel weight'); // 40000 + 24000 = 64000 > 58000
    expect(names).toContain('Passengers');
    expect(names).toContain('Cargo');
    expect(r.warnings[0]).toMatch(/^LIMIT EXCEEDED/);
  });

  it('scales climb and descent on short legs', () => {
    const r = computePlan(INPUTS, TEST_PROFILE, 100, 0);
    expect(r.cruise.distanceNm).toBe(0);
    expect(r.climb.distanceNm + r.descent.distanceNm).toBeCloseTo(100);
    expect(r.warnings.join(' ')).toMatch(/too short/);
  });

  it('adds alternate fuel at the alternate cruise level', () => {
    const r = computePlan(INPUTS, TEST_PROFILE, 500, 150);
    expect(r.fuel.alternate).toBeGreaterThan(0);
    const ph = flightPhases(150, 10000, TEST_PROFILE.performance, 0, 'Alternate', []);
    expect(r.fuel.alternate).toBeCloseTo(ph.climb.fuel + ph.cruise.fuel + ph.descent.fuel, 6);
  });

  it('applies wind to cruise ground speed only', () => {
    const calm = computePlan(INPUTS, TEST_PROFILE, 500, 0);
    const head = computePlan({ ...INPUTS, windKt: -50 }, TEST_PROFILE, 500, 0);
    expect(head.climb.timeMin).toBeCloseTo(calm.climb.timeMin);
    expect(head.cruise.timeMin).toBeCloseTo((335 / 400) * 60, 3);
  });

  it('converts a kg profile to lb on request', () => {
    const r = computePlan({ ...INPUTS, units: 'lb', paxWeight: 220, cargo: 2204.6 }, TEST_PROFILE, 500, 0);
    expect(r.units).toBe('lb');
    expect(r.weights.oew).toBeCloseTo(convertWeight(40000, 'kg', 'lb'), 3);
    expect(r.fuel.trip).toBeCloseTo(convertWeight(4093.33, 'kg', 'lb'), 0);
  });

  it('marks unverified profiles', () => {
    const r = computePlan(INPUTS, { ...TEST_PROFILE, verified: false }, 500, 0);
    expect(r.warnings.join(' ')).toMatch(/PLACEHOLDERS/);
  });
});

describe('profiles', () => {
  it('ships the requested profiles, all unverified and valid', () => {
    expect(DEFAULT_PROFILES.map((p) => p.id).sort()).toEqual(['fenix-a319', 'fenix-a320', 'fslabs-a321', 'ifly-737-max8', 'pmdg-737-800', 'pmdg-777-200er']);
    for (const p of DEFAULT_PROFILES) {
      expect(p.verified).toBe(false);
      expect(p.placeholderNotice).toMatch(/PLACEHOLDER/);
      expect(validateProfile(p)).toEqual([]);
    }
  });

  it('has the three 777 engine variants', () => {
    const p = DEFAULT_PROFILES.find((x) => x.id === 'pmdg-777-200er')!;
    expect(Object.keys(p.variants ?? {})).toEqual(['GE90-94B', 'PW4090', 'Trent 895']);
    const v = withVariant(p, 'PW4090');
    expect(v.performance.burnPerHour.climb).toBe(p.performance.burnPerHour.climb);
  });

  it('rejects broken profiles', () => {
    expect(validateProfile({ ...TEST_PROFILE, units: 'stone' })).toContain('"units" must be "kg" or "lb".');
    expect(validateProfile({ ...TEST_PROFILE, weights: { ...TEST_PROFILE.weights, mtow: 'heavy' } }).join(' ')).toMatch(/weights.mtow/);
  });

  it('derives default taxi fuel', () => {
    expect(defaultTaxiFuel(TEST_PROFILE)).toBe(120); // 600/h × 12 min
  });
});
