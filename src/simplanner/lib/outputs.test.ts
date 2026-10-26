// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildLnmpln, buildPln, type ExportFlight } from './exports';
import { DEFAULT_TEMPLATES, PLACEHOLDERS, renderTemplate, templateVars } from './fmc';
import { computePlan } from './planning';
import { DEFAULT_PROFILES } from './profiles';
import { parseRoute, type RoutePoint } from './route';
import { customWaypointProvider } from './navdata';
import type { FlightInputs } from './store';

const pt = (ident: string, lat: number, lon: number, type: RoutePoint['type'] = 'user'): RoutePoint => ({ ident, lat, lon, type, source: 't', via: '' });

const FLIGHT: ExportFlight = {
  dep: { ...pt('ZBAA', 40.080101, 116.584999, 'airport'), name: 'Beijing Capital', elevationFt: 116 },
  arr: { ...pt('RJTT', 35.552299, 139.779999, 'airport'), name: 'Tokyo Haneda & Co', elevationFt: 35 },
  enroute: [pt('WPT1', 39.5, 118), pt('4000N12000E', 40, 120, 'coord'), pt('WPT1', 37, 126)],
  cruiseAltFt: 35000,
  title: 'ZBAA to RJTT',
};

describe('MSFS .pln export', () => {
  const xml = buildPln(FLIGHT);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  it('is well-formed XML with the AceXML root', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('SimBase.Document');
    expect(doc.getElementsByTagName('DepartureID')[0].textContent).toBe('ZBAA');
    expect(doc.getElementsByTagName('CruisingAlt')[0].textContent).toBe('35000.000');
  });

  it('writes airports and unique user waypoints in order', () => {
    const wps = [...doc.getElementsByTagName('ATCWaypoint')];
    expect(wps.map((w) => w.getAttribute('id'))).toEqual(['ZBAA', 'WPT1', 'WP1', 'WPT12', 'RJTT']);
    expect(wps.map((w) => w.getElementsByTagName('ATCWaypointType')[0].textContent)).toEqual(['Airport', 'User', 'User', 'User', 'Airport']);
    expect(wps[0].getElementsByTagName('WorldPosition')[0].textContent).toBe('N40° 4\' 48.36",E116° 35\' 6.00",+000116.00');
  });

  it('escapes names', () => {
    expect(xml).toContain('Tokyo Haneda &amp; Co');
  });
});

describe('Little Navmap export', () => {
  const doc = new DOMParser().parseFromString(buildLnmpln(FLIGHT, new Date('2026-10-26T10:00:00Z')), 'application/xml');
  it('is well-formed and lists every point', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.tagName).toBe('LittleNavmap');
    const types = [...doc.getElementsByTagName('Waypoint')].map((w) => w.getElementsByTagName('Type')[0].textContent);
    expect(types).toEqual(['AIRPORT', 'USER', 'USER', 'USER', 'AIRPORT']);
    const pos = doc.getElementsByTagName('Pos')[0];
    expect(pos.getAttribute('Lat')).toBe('40.080101');
    expect(doc.getElementsByTagName('CreationDate')[0].textContent).toBe('2026-10-26T10:00:00');
  });
});

describe('FMC cheat sheets', () => {
  it('ships a template for every profile', () => {
    for (const p of DEFAULT_PROFILES) expect(DEFAULT_TEMPLATES[p.fmcTemplate], p.id).toBeTruthy();
  });

  it('marks every page line as UNVERIFIED', () => {
    for (const [id, text] of Object.entries(DEFAULT_TEMPLATES)) {
      const pageLines = text.split('\n').filter((l) => /\b(Page|Pages|Button|Buttons):/.test(l));
      expect(pageLines.length, id).toBeGreaterThan(3);
      for (const l of pageLines) expect(l, `${id}: ${l}`).toContain('[UNVERIFIED]');
      expect(text).toContain('Fuel and weights are estimates, verify with the aircraft\'s own performance tools.');
    }
  });

  it('only uses documented placeholders', () => {
    for (const [id, text] of Object.entries(DEFAULT_TEMPLATES)) {
      for (const m of text.matchAll(/\{([a-z0-9_]+)\}/g)) expect(PLACEHOLDERS, `${id}: {${m[1]}}`).toHaveProperty(m[1]);
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(renderTemplate('ZFW {zfw_t} {oops}', { zfw_t: '61.6' })).toBe('ZFW 61.6 {oops}');
  });

  it('builds variables from a plan', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.id === 'pmdg-737-800')!;
    const inputs: FlightInputs = {
      profileId: profile.id, cruiseFl: 350, paxCount: 150, cargo: 2000, paxWeight: 84, contingencyPct: 5, reserveMin: 30,
      taxiFuel: 200, extraFuel: 0, windKt: 0, costIndex: 30, dep: 'zbaa', arr: 'rjtt', altn: 'rjaa', route: 'WPT1 W5 WPT2', depRwy: '36r', arrRwy: '', flightNo: '', routeMode: 'manual', autoCruise: false, autoAlternate: false, autoRunways: false,
    };
    const route = parseRoute(inputs.route, [customWaypointProvider([{ ident: 'WPT1', lat: 39.5, lon: 118 }, { ident: 'WPT2', lat: 37, lon: 126 }])]);
    const plan = computePlan(inputs, profile, 1100, 40);
    const v = templateVars(inputs, plan, route, profile.name);
    expect(v.cruise_fl).toBe('FL350');
    expect(v.dep_rwy).toBe('36R');
    expect(v.arr_rwy).toBe('(not set)');
    expect(v.route).toBe('ZBAA WPT1 W5 WPT2 RJTT');
    expect(v.zfw_t).toBe((Math.round(plan.weights.zfw / 100) / 10).toFixed(1));
    const text = renderTemplate(DEFAULT_TEMPLATES['pmdg-737'], v);
    expect(text).not.toMatch(/\{[a-z0-9_]+\}/);
    expect(text).toContain('WPT1 W5 WPT2');
  });
});
