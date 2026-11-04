import { describe, expect, it } from 'vitest';
import {
  approachSamples, bearingDeg, destination, distanceNm, glidePathFt, loadTerrain, mToFt, overpassQuery, parseEle,
  parseFeatures, ringSamples, runwayHeading, summarize,
} from './terrain';

const FIELD = { lat: 29.3033, lon: 94.3353 }; // ZUNZ-like position, made-up terrain below
const FIELD_M = 2950;

// Made-up ground: flat at the field, a ridge rising to the east, a hill 6 nm west.
function groundM(lat: number, lon: number): number {
  const east = distanceNm(FIELD, { lat, lon }) * Math.max(0, Math.sin(((bearingDeg(FIELD, { lat, lon }) * Math.PI) / 180)));
  const hill = Math.max(0, 900 - 300 * distanceNm(destination(FIELD, 270, 6), { lat, lon }));
  return FIELD_M + east * 120 + hill;
}

function fakeFetch(osm: unknown, calls: string[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes('elevation')) {
      const u = new URL(String(url));
      const lats = u.searchParams.get('latitude')!.split(',').map(Number);
      const lons = u.searchParams.get('longitude')!.split(',').map(Number);
      if (lats.length > 100) return new Response('too many', { status: 400 });
      return Response.json({ elevation: lats.map((la, i) => groundM(la, lons[i])) });
    }
    expect(init?.method).toBe('POST');
    return osm instanceof Response ? osm : Response.json(osm);
  }) as typeof fetch;
}

const OSM = {
  elements: [
    { type: 'node', lat: 29.5, lon: 94.5, tags: { natural: 'peak', name: 'Test Peak', ele: '5,200 m' } },
    { type: 'node', lat: 29.31, lon: 94.2, tags: { natural: 'peak', ele: '15000 ft' } },
    { type: 'node', lat: 29.2, lon: 94.3, tags: { natural: 'peak', name: 'Low Hill', ele: '2800' } },
    { type: 'node', lat: 29.4, lon: 94.4, tags: { mountain_pass: 'yes', name: 'Test La', ele: '4100' } },
    { type: 'way', center: { lat: 29.25, lon: 94.4 }, tags: { natural: 'water', name: '湖', 'name:en': 'Test Lake' } },
    { type: 'node', lat: 29.65, lon: 94.36, tags: { place: 'town', name: 'Test Town' } },
    { type: 'node', lat: 29.3, lon: 94.3, tags: { natural: 'tree' } },
    { type: 'node', tags: { natural: 'peak', ele: '1' } },
  ],
};

describe('geometry and parsing', () => {
  it('projects points and runway headings', () => {
    const p = destination(FIELD, 90, 10);
    expect(distanceNm(FIELD, p)).toBeCloseTo(10, 3);
    expect(bearingDeg(FIELD, p)).toBeCloseTo(90, 0);
    expect(runwayHeading('05')).toBe(50);
    expect(runwayHeading('24R')).toBe(240);
    expect(runwayHeading('36')).toBe(0);
    expect(runwayHeading('')).toBeNull();
    expect(runwayHeading('H1')).toBeNull();
    expect(ringSamples(FIELD)).toHaveLength(10 * 36);
    // Approach to runway 05 comes from the south-west.
    expect(bearingDeg(FIELD, approachSamples(FIELD, 50)[10].p)).toBeCloseTo(230, 0);
    expect(glidePathFt(1)).toBeCloseTo(318, 0);
  });

  it('reads OpenStreetMap heights in metres or feet', () => {
    expect(parseEle('5,200 m')).toBe(5200);
    expect(parseEle('4500')).toBe(4500);
    expect(parseEle('15000 ft')).toBeCloseTo(4572, 0);
    expect(parseEle('approx')).toBeNull();
    expect(parseEle(undefined)).toBeNull();
  });

  it('keeps useful features with distance and bearing', () => {
    const f = parseFeatures(OSM, FIELD);
    expect(f.map((x) => [x.kind, x.name])).toEqual([
      ['peak', 'Test Peak'], ['peak', 'Unnamed summit'], ['peak', 'Low Hill'], ['pass', 'Test La'], ['water', 'Test Lake'], ['town', 'Test Town'],
    ]);
    expect(f[4].lat).toBe(29.25); // way centre
    expect(f[5].distNm).toBeCloseTo(20.8, 0);
    expect(parseFeatures({ nope: 1 }, FIELD)).toEqual([]);
    expect(overpassQuery(FIELD)).toContain('around:46300,29.30330,94.33530');
  });
});

describe('loading and summarising', () => {
  it('finds the highest terrain, quadrant figures and the approach clearance', async () => {
    const calls: string[] = [];
    const d = await loadTerrain({ icao: 'ZUNZ', lat: FIELD.lat, lon: FIELD.lon, elevation: 9675, runway: '05' }, fakeFetch(OSM, calls), new Date('2026-11-04T00:00:00Z'));
    expect(calls.filter((c) => c.includes('elevation'))).toHaveLength(4); // 1 + 360 + 16 points, 100 per request
    expect(d.grid).toHaveLength(10);
    expect(d.grid[0]).toHaveLength(36);
    expect(d.approach).toHaveLength(16);
    expect(d.fieldElevFt).toBe(9675);
    expect(d.features).toHaveLength(6);

    const s = summarize(d);
    // The ridge peaks due east at 25 nm: 2950 + 25 × 120 m.
    expect(s.within25.brg).toBe(90);
    expect(s.within25.distNm).toBe(25);
    expect(s.within25.elevFt).toBeCloseTo(mToFt(2950 + 3000), -1);
    expect(s.quadrants.map((q) => q.name)).toEqual(['North', 'East', 'South', 'West']);
    expect(s.quadrants[1].plus1000).toBe(Math.ceil((s.within25.elevFt + 1000) / 100) * 100);
    // Within 10 nm, the unnamed 15,000 ft summit (OSM) beats the sampled ground.
    expect(s.within10.name).toBe('Unnamed summit');
    expect(s.within10.elevFt).toBeCloseTo(15000, 0);
    // West quadrant: the hill 6 nm out.
    expect(s.quadrants[3].highest.brg).toBeGreaterThan(225);
    // Approach from the SW over flat ground: least clearance at 3 nm, the glide path height there.
    expect(s.approach!.atNm).toBe(3);
    expect(s.approach!.minClearanceFt).toBeCloseTo(3 * 318, -1);
    // Peaks above the field, highest first; Low Hill (2,800 m) is below it.
    expect(s.peaks.map((p) => p.name)).toEqual(['Test Peak', 'Unnamed summit']);
  });

  it('still shows terrain when OpenStreetMap fails', async () => {
    const d = await loadTerrain({ icao: 'ZUNZ', lat: FIELD.lat, lon: FIELD.lon, elevation: null, runway: '' }, fakeFetch(new Response('busy', { status: 429 })));
    expect(d.features).toEqual([]);
    expect(d.featuresError).toMatch(/HTTP 429/);
    expect(d.approach).toEqual([]);
    expect(d.fieldElevFt).toBe(Math.round(mToFt(FIELD_M)));
    expect(summarize(d).approach).toBeNull();
  });
});
