import { describe, expect, it } from 'vitest';
import { normalise } from './simbrief';
import { buildDemoOfp } from '../sample/demoOfp';

describe('normalise', () => {
  it('maps the demo OFP', () => {
    const p = normalise(buildDemoOfp());
    expect(p.origin.icao).toBe('EGLL');
    expect(p.destination.runway).toBe('24R');
    expect(p.alternates.map((a) => a.icao)).toEqual(['LEGE']);
    expect(p.navlog.length).toBeGreaterThan(5);
    expect(p.navlog.at(-1)!.totalDistance).toBe(p.routeDistance);
    expect(p.takeoff?.runways[0].v1).toBe(141);
    expect(p.landing?.runways[0].vref).toBe(133);
    expect(p.units).toBe('kgs');
  });

  it('tolerates empty nodes and missing sections', () => {
    const p = normalise({
      params: { units: 'lbs' },
      origin: { icao_code: 'KJFK', plan_rwy: {} },
      destination: { icao_code: 'KBOS' },
      alternate: [{ icao_code: 'KPVD' }, { icao_code: 'KBDL' }],
      navlog: { fix: { ident: 'MERIT', pos_lat: '41.38', pos_long: '-73.13', distance: '50' } },
      weather: { orig_metar: 'KJFK 231151Z 01008KT 10SM FEW250 12/03 A3012' },
      fuel: {},
    });
    expect(p.units).toBe('lbs');
    expect(p.origin.runway).toBe('');
    expect(p.origin.metar).toContain('KJFK');
    expect(p.alternates).toHaveLength(2);
    expect(p.navlog).toHaveLength(1);
    expect(p.fuel.trip).toBeNull();
    expect(p.takeoff).toBeNull();
  });
});
