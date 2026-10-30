import { describe, expect, it } from 'vitest';
import { AirportIndex, type AirportDataset } from './airports';
import { toEfbPlan } from './efb';
import { computePlan } from './planning';
import { DEFAULT_PROFILES } from './profiles';
import { parseRoute } from './route';
import { defaultInputs } from '../state';

// Approximate positions, made-up beacon.
const DS: AirportDataset = {
  importedAt: '', source: 'test',
  airports: [
    ['ZUDC', 'Daocheng Yading', 29.3233, 100.0533, 14472, 'CN', 'Daocheng', '', 'M'],
    ['ZUNZ', 'Nyingchi Mainling', 29.3033, 94.3353, 9675, 'CN', 'Nyingchi', '', 'M'],
    ['ZULS', 'Lhasa Gonggar', 29.298, 90.912, 11713, 'CN', 'Lhasa', '', 'L'],
  ],
  runways: { ZUDC: [['15', 13780, 151, 'ASP']], ZUNZ: [['05', 9843, 50, 'ASP']], ZULS: [['09', 13123, 88, 'CON']] },
  navaids: [['BBB', 'Test B', 'VOR-DME', 29.25, 96.4, 'HI']],
};

describe('sending a flight to the EFB', () => {
  const index = new AirportIndex(DS, []);
  const profile = DEFAULT_PROFILES.find((p) => p.id === 'pmdg-737-800')!;
  const inputs = { ...defaultInputs(profile), dep: 'ZUDC', arr: 'ZUNZ', altn: 'ZULS', route: 'BBB', depRwy: '15', arrRwy: '05', flightNo: 'tbA123', cruiseFl: 320 };
  const [dep, arr, altn] = ['ZUDC', 'ZUNZ', 'ZULS'].map((i) => index.get(i)!);
  const route = parseRoute(inputs.route, [index.provider(), index.navaidProvider()], index.toFix(dep), index.toFix(arr));
  const plan = computePlan(inputs, profile, route.totalNm, 200, { dep: dep.elevationFt, arr: arr.elevationFt, altn: altn.elevationFt });
  const efb = toEfbPlan({ inputs, plan, route, profile, dep, arr, altn, fmcText: 'FMC TEXT', now: new Date('2026-10-30T08:00:00Z') });

  it('fills the EFB flight with SimPlanner’s numbers', () => {
    expect(efb).toMatchObject({ source: 'simplanner', units: 'kgs', callsign: 'TBA123', airline: 'TBA', route: 'BBB', cruiseAlt: 32000 });
    expect(efb.aircraft).toMatchObject({ icao: 'B738', name: 'PMDG 737-800' });
    expect(efb.origin).toMatchObject({ icao: 'ZUDC', runway: '15', elevation: 14472, lat: 29.3233 });
    expect(efb.alternates.map((a) => a.icao)).toEqual(['ZULS']);
    expect(efb.fuel.planRamp).toBe(Math.round(plan.fuel.block));
    expect(efb.weights.tow).toBe(Math.round(plan.weights.tow));
    expect(efb.weights.maxTow).toBe(profile.weights.mtow);
    expect(efb.times.ete).toBe(Math.round(plan.tripTimeMin * 60));
    expect(efb.times.estOut).toBeNull(); // no departure time in SimPlanner
  });

  it('builds a navlog from departure to arrival with fuel falling and time rising', () => {
    expect(efb.navlog.map((f) => f.ident)).toEqual(['ZUDC', 'BBB', 'ZUNZ']);
    expect(efb.navlog[0]).toMatchObject({ type: 'apt', totalDistance: 0, fuelOnboard: Math.round(plan.fuel.takeoff) });
    const last = efb.navlog[2];
    expect(last).toMatchObject({ type: 'apt', stage: 'DSC', totalDistance: Math.round(route.totalNm) });
    expect(last.totalTime).toBeCloseTo(plan.tripTimeMin * 60, -1);
    expect(last.fuelOnboard!).toBeCloseTo(plan.fuel.takeoff - plan.fuel.trip, -1);
    expect(efb.navlog[1].altitude).toBeGreaterThan(14472);
  });

  it('includes a text OFP with the estimate warning, safely escaped', () => {
    expect(efb.ofpHtml).toMatch(/^<pre>\[ SimPlanner OFP \]/);
    expect(efb.ofpHtml).toContain('FMC TEXT');
    expect(efb.ofpHtml).toMatch(/Fuel and weights are estimates/);
    const evil = toEfbPlan({ inputs, plan, route, profile, dep, arr, altn, fmcText: '<script>x</script>' });
    expect(evil.ofpHtml).not.toContain('<script>');
  });
});
