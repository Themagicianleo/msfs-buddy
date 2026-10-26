import { describe, expect, it } from 'vitest';
import { AirportIndex, buildDataset, mergeNavaids, parseOpenAipNavaids, type Airport, type Navaid, type NavaidRow } from './airports';
import { generateRoute, pickRunway, suggestAlternates, suggestCruiseFl, trackPosition } from './autoplan';

const nav = (ident: string, lat: number, lon: number, type = 'VOR-DME', usage = 'HI', country = ''): Navaid => ({ ident, name: ident, type, lat, lon, usage, country, source: 'ourairports' });
const DEP = { lat: 0, lon: 0 };
const ARR = { lat: 0, lon: 10 }; // ~600 nm east along the equator

describe('track geometry', () => {
  it('measures cross-track and along-track distance', () => {
    const t = trackPosition(DEP, ARR, { lat: 0.5, lon: 5 });
    expect(t.alongNm).toBeCloseTo(300.2, 0);
    expect(Math.abs(t.crossNm)).toBeCloseTo(30, 0);
    expect(trackPosition(DEP, ARR, { lat: 0, lon: -1 }).alongNm).toBeLessThan(0);
  });
});

describe('route generator', () => {
  const navaids = [
    nav('AAA', 0.1, 2),
    nav('NDB1', 0.05, 3, 'NDB'),
    nav('BBB', -0.2, 4.5),
    nav('FAR', 3, 5), // 180 nm off track
    nav('CCC', 0.1, 7.5),
    nav('TOOCLOSE', 0, 9.8), // inside the terminal area
  ];

  it('builds a VOR-to-VOR route along the track', () => {
    const r = generateRoute(DEP, ARR, navaids, 'navaids');
    expect(r.route).toBe('AAA DCT BBB DCT CCC');
    expect(r.navaids.map((n) => n.ident)).not.toContain('FAR');
    expect(r.routeNm).toBeGreaterThanOrEqual(r.directNm);
    expect(r.routeNm / r.directNm).toBeLessThan(1.02);
    expect(r.note).toMatch(/Not an airway route/);
  });

  it('prefers VORs over NDBs', () => {
    const r = generateRoute(DEP, ARR, navaids, 'navaids');
    expect(r.route).not.toContain('NDB1');
  });

  it('flies direct over empty stretches and when asked', () => {
    expect(generateRoute(DEP, ARR, [], 'navaids').route).toBe('DCT');
    expect(generateRoute(DEP, ARR, navaids, 'direct').route).toBe('DCT');
    const gap = generateRoute(DEP, { lat: 0, lon: 30 }, [nav('ONLY', 0, 15)], 'navaids');
    expect(gap.route).toBe('ONLY');
  });

  it('uses direct for short hops', () => {
    expect(generateRoute(DEP, { lat: 0, lon: 1.5 }, navaids, 'navaids').note).toMatch(/Short flight/);
  });
});

describe('cruise level', () => {
  it('follows distance and the semicircular rule', () => {
    expect(suggestCruiseFl(306, 270, 350)).toBe(320); // westbound: even
    expect(suggestCruiseFl(306, 90, 350)).toBe(310); // eastbound: odd
    expect(suggestCruiseFl(2000, 270, 350)).toBe(340); // capped, then made even
    expect(suggestCruiseFl(2000, 45, 370)).toBe(370);
    expect(suggestCruiseFl(20, 90, 350)).toBe(110);
    expect(suggestCruiseFl(20, 200, 350)).toBe(100);
  });
});

describe('alternates and runways', () => {
  const AIR = `"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"
1,"RJTT","large_airport","Haneda",35.552,139.78,35,"AS","JP","","Tokyo","yes","RJTT","HND","RJTT","","","",""
2,"RJAA","large_airport","Narita",35.765,140.386,141,"AS","JP","","Narita","yes","RJAA","NRT","RJAA","","","",""
3,"RJTF","small_airport","Chofu",35.672,139.528,141,"AS","JP","","Chofu","no","RJTF","","RJTF","","","",""
4,"RJSS","large_airport","Sendai",38.139,140.917,15,"AS","JP","","Sendai","yes","RJSS","SDJ","RJSS","","","",""
6,"RJTA","medium_airport","Atsugi Air Base",35.454,139.45,205,"AS","JP","","Yamato","no","RJTA","","RJTA","","","",""
7,"RKSI","large_airport","Incheon",37.469,126.451,23,"AS","KR","","Seoul","yes","RKSI","ICN","RKSI","","","",""
5,"XX99","small_airport","Strip",35.6,139.9,0,"AS","JP","","","no","","","","","","",""`;
  const RWY = `"id","airport_ref","airport_ident","length_ft","width_ft","surface","lighted","closed","le_ident","le_latitude_deg","le_longitude_deg","le_elevation_ft","le_heading_degT","le_displaced_threshold_ft","he_ident","he_latitude_deg","he_longitude_deg","he_elevation_ft","he_heading_degT","he_displaced_threshold_ft"
1,1,"RJTT",9843,197,"ASP",1,0,"16R",0,0,0,157,,"34L",0,0,0,337,
2,1,"RJTT",8202,197,"ASP",1,0,"04",0,0,0,43,,"22",0,0,0,223,
3,2,"RJAA",13123,197,"ASP",1,0,"16R",0,0,0,157,,"34L",0,0,0,337,
4,3,"RJTF",2625,98,"ASP",1,0,"17",0,0,0,170,,"35",0,0,0,350,
5,4,"RJSS",9843,148,"ASP",1,0,"12",0,0,0,120,,"30",0,0,0,300,
6,6,"RJTA",8000,148,"ASP",1,0,"01",0,0,0,10,,"19",0,0,0,190,
7,7,"RKSI",12303,197,"ASP",1,0,"15L",0,0,0,150,,"33R",0,0,0,330,`;
  const NAV = `"id","filename","ident","name","type","frequency_khz","latitude_deg","longitude_deg","elevation_ft","iso_country","dme_frequency_khz","dme_channel","dme_latitude_deg","dme_longitude_deg","dme_elevation_ft","slaved_variation_deg","magnetic_variation_deg","usageType","power","associated_airport"
1,"x","HME","Haneda","VOR-DME",112200,35.55,139.77,0,"JP","","","","","","","","BOTH","HIGH","RJTT"
2,"x","XX","Some DME","DME",0,35,139,0,"JP","","","","","","","","","",""`;
  const ds = buildDataset(AIR, RWY, 'test', NAV);
  const idx = new AirportIndex(ds, []);
  const rjtt = idx.get('RJTT')!;

  it('keeps sizes and navaids in the dataset', () => {
    expect(ds.airports.map((a) => a[0])).toEqual(['RJTT', 'RJAA', 'RJTF', 'RJSS', 'RJTA', 'RKSI']); // XX99 has no ICAO code
    expect(idx.get('RJTA')?.scheduled).toBe(false);
    expect(rjtt.size).toBe('large');
    expect(ds.navaids?.map((n) => n[0])).toEqual(['HME']); // DME-only dropped
    expect(idx.navaidProvider().findFix('HME')[0]).toMatchObject({ type: 'vor', lat: 35.55 });
  });

  it('suggests alternates with a long enough runway, nearest first', () => {
    const alts = suggestAlternates(idx, rjtt, 6500);
    expect(alts.map((a) => a.airport.icao)).toEqual(['RJAA', 'RJSS']); // Chofu too small, Atsugi no airline service
    expect(alts[0].distanceNm).toBeGreaterThan(25);
  });

  it('prefers alternates in the arrival country', () => {
    const busan: Airport = { icao: 'RKPK', name: 'Busan', lat: 35.18, lon: 128.94, elevationFt: 6, runways: [], country: 'KR', source: 'custom' };
    const idx2 = new AirportIndex(ds, [busan]);
    const fromBusan = suggestAlternates(idx2, idx2.get('RKPK')!, 6500, 5, 600);
    expect(fromBusan[0].airport.icao).toBe('RKSI'); // same country beats nearer Japanese airports
  });

  it('picks the runway into the wind, else the longest', () => {
    expect(pickRunway(rjtt, { dir: 340, speed: 15 }).runway?.ident).toBe('34L');
    expect(pickRunway(rjtt, { dir: 220, speed: 12 }).runway?.ident).toBe('22');
    expect(pickRunway(rjtt, { dir: 220, speed: 12 }, 9000).runway?.ident).toBe('16R'); // 22 too short; best of 16R/34L into a 220 wind
    expect(pickRunway(rjtt, null).runway?.ident).toBe('16R');
    expect(pickRunway(rjtt, { dir: null, speed: 3 }).reason).toMatch(/longest/);
    // No headings in the data: fall back to the runway number.
    const noHdg: Airport = { ...rjtt, runways: rjtt.runways.map((r) => ({ ...r, headingDeg: null })) };
    expect(pickRunway(noHdg, { dir: 340, speed: 15 }).runway?.ident).toBe('34L');
    expect(pickRunway(noHdg, { dir: 340, speed: 15 }).reason).toMatch(/runway number/);
    const none: Airport = { ...rjtt, runways: [] };
    expect(pickRunway(none, null).runway).toBeNull();
  });
});

describe('openAIP navaids', () => {
  const sample = [
    { name: 'DAOCHENG', identifier: 'dcy', type: 4, country: 'CN', geometry: { type: 'Point', coordinates: [100.06, 29.32] } },
    { name: 'SOME NDB', identifier: 'XY', type: 2, country: 'CN', geometry: { type: 'Point', coordinates: [99.0, 29.5] } },
    { name: 'DME ONLY', identifier: 'DM1', type: 0, geometry: { type: 'Point', coordinates: [99.0, 29.5] } },
    { name: 'BROKEN', identifier: 'BAD', type: 3 },
  ];

  it('reads the JSON export and skips DMEs and broken rows', () => {
    const rows = parseOpenAipNavaids(sample);
    expect(rows.map((r) => [r[0], r[2], r[6], r[7]])).toEqual([['DCY', 'VOR-DME', 'CN', 'a'], ['XY', 'NDB', 'CN', 'a']]);
    expect(rows[0][3]).toBe(29.32);
  });

  it('reads the GeoJSON export too', () => {
    const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [100.06, 29.32] }, properties: { name: 'DAOCHENG', identifier: 'DCY', type: 3 } }] };
    expect(parseOpenAipNavaids(geo, 'CN').map((r) => [r[0], r[2], r[6]])).toEqual([['DCY', 'VOR', 'CN']]);
    expect(parseOpenAipNavaids({ nope: true })).toEqual([]);
  });

  it('merges without duplicating beacons already present', () => {
    const base: NavaidRow[] = [['DCY', 'Daocheng', 'VOR-DME', 29.33, 100.05, 'HI', 'CN', 'o']];
    const { merged, added } = mergeNavaids(base, parseOpenAipNavaids(sample));
    expect(added).toBe(1); // DCY is the same beacon (within 10 nm); XY is new
    expect(merged.map((r) => r[0])).toEqual(['DCY', 'XY']);
  });

  it('keeps domestic routes on domestic beacons', () => {
    const cn = (ident: string, lon: number, country: string) => nav(ident, 0, lon, 'VOR-DME', 'HI', country);
    const r = generateRoute({ ...DEP, country: 'CN' }, { ...ARR, country: 'CN' }, [cn('FOREIGN', 3, 'IN'), cn('HOME', 6, 'CN')], 'navaids');
    expect(r.route).toBe('HOME');
    const intl = generateRoute({ ...DEP, country: 'CN' }, { ...ARR, country: 'IN' }, [cn('FOREIGN', 3, 'IN'), cn('HOME', 6, 'CN')], 'navaids');
    expect(intl.route).toBe('FOREIGN DCT HOME');
  });
});
