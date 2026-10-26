// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AirportIndex, buildDataset, parseCsv } from './airports';
import { decodeShare, encodeShare, makeBackup, mergeBackup, type StoreData } from './store';
import { getWeather } from './weather';

const AIRPORTS_CSV = `"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"
1,"ZBAA","large_airport","Beijing Capital International Airport",40.080101,116.584999,116,"AS","CN","CN-11","Beijing","yes","ZBAA","PEK","ZBAA","","","","Capital, ""PEK"""
2,"CN-0042","medium_airport","Some Mountain Airport",29.323,100.053,14472,"AS","CN","CN-51","Daocheng","yes","","DCY","ZUDC","","","",""
3,"XX01","heliport","A Heliport",1,1,0,"AS","CN","","","no","","","","","","",""
4,"RJTT","large_airport","Tokyo Haneda International Airport",35.552299,139.779999,35,"AS","JP","JP-13","Tokyo","yes","RJTT","HND","RJTT","","","",""
`;
const RUNWAYS_CSV = `"id","airport_ref","airport_ident","length_ft","width_ft","surface","lighted","closed","le_ident","le_latitude_deg","le_longitude_deg","le_elevation_ft","le_heading_degT","le_displaced_threshold_ft","he_ident","he_latitude_deg","he_longitude_deg","he_elevation_ft","he_heading_degT","he_displaced_threshold_ft"
10,1,"ZBAA",12467,197,"CON",1,0,"18L",40.1,116.6,100,179.6,,"36R",40.06,116.6,110,359.6,
11,2,"CN-0042",13780,148,"ASP",1,0,"15",29.33,100.05,14470,151,,"33",29.31,100.06,14470,331,
12,4,"RJTT",9843,197,"ASP",1,1,"04",35.5,139.7,20,,,"22",35.5,139.8,20,,
`;

describe('OurAirports import', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });

  it('builds a compact dataset keyed by ICAO code', () => {
    const ds = buildDataset(AIRPORTS_CSV, RUNWAYS_CSV);
    expect(ds.airports.map((a) => a[0])).toEqual(['ZBAA', 'ZUDC', 'RJTT']); // heliport dropped
    expect(ds.runways.ZBAA.map((r) => r[0])).toEqual(['18L', '36R']);
    expect(ds.runways.ZUDC[0]).toEqual(['15', 13780, 151, 'ASP']);
    expect(ds.runways.RJTT).toBeUndefined(); // closed runway skipped
  });

  it('looks airports up, with custom airports taking priority', () => {
    const ds = buildDataset(AIRPORTS_CSV, RUNWAYS_CSV);
    const idx = new AirportIndex(ds, [
      { icao: 'ZUNZ', name: 'Nyingchi (my entry)', lat: 29.303, lon: 94.335, elevationFt: 9675, runways: [{ ident: '05', lengthFt: 9843, headingDeg: 50 }], source: 'custom' },
      { icao: 'ZBAA', name: 'Capital (my fix)', lat: 40, lon: 116, elevationFt: 100, runways: [], source: 'custom' },
    ]);
    expect(idx.get('zudc')?.name).toBe('Some Mountain Airport');
    expect(idx.get('CN-0042')?.icao).toBe('ZUDC'); // alias by OurAirports ident
    expect(idx.get('ZUNZ')?.source).toBe('custom');
    expect(idx.get('ZBAA')?.name).toBe('Capital (my fix)');
    expect(idx.search('tokyo').map((a) => a.icao)).toEqual(['RJTT']);
    expect(idx.provider().findFix('RJTT')[0]).toMatchObject({ ident: 'RJTT', type: 'airport' });
    expect(idx.provider().findFix('WPT1')).toEqual([]);
  });
});

describe('backup and share links', () => {
  const store: StoreData = {
    profiles: {},
    templates: { 'pmdg-737': 'edited' },
    airports: [{ icao: 'ZUNZ', name: 'N', lat: 1, lon: 2, elevationFt: 0, runways: [], source: 'custom' }],
    waypoints: [{ ident: 'WPT1', lat: 1, lon: 2 }],
    flights: [],
    draft: null,
  };

  it('round-trips and merges a backup', () => {
    const text = JSON.stringify(makeBackup(store));
    const empty: StoreData = { profiles: {}, templates: {}, airports: [], waypoints: [{ ident: 'X', lat: 0, lon: 0 }], flights: [], draft: null };
    const { next, summary } = mergeBackup(empty, text);
    expect(next.airports).toHaveLength(1);
    expect(next.waypoints.map((w) => w.ident)).toEqual(['X', 'WPT1']);
    expect(next.templates['pmdg-737']).toBe('edited');
    expect(summary).toMatch(/1 airports/);
  });

  it('rejects files that are not backups', () => {
    expect(() => mergeBackup(store, '{"foo":1}')).toThrow(/not a SimPlanner backup/);
    expect(() => mergeBackup(store, 'nope')).toThrow(/not valid JSON/);
  });

  it('encodes share links with unicode intact', () => {
    const obj = { route: 'ZBAA W5 RJTT', note: 'Tokyo 東京 — ✈' };
    const s = encodeShare(obj);
    expect(s).not.toMatch(/[+/=]/);
    expect(decodeShare(s)).toEqual(obj);
  });
});

describe('weather', () => {
  it('returns live reports and caches them', async () => {
    localStorage.clear();
    const r = await getWeather(['zbaa'], async () => ({ metar: { ZBAA: 'ZBAA 260600Z 36004MPS CAVOK 12/M05 Q1021 NOSIG' }, taf: { ZBAA: 'TAF ZBAA ...' }, source: 'aviationweather.gov' }));
    expect(r.offline).toBe(false);
    expect(r.stations.ZBAA.metar).toMatch(/^ZBAA/);
  });

  it('falls back to the cache when offline', async () => {
    const r = await getWeather(['ZBAA', 'ZUDC'], async () => {
      throw new Error('offline');
    });
    expect(r.offline).toBe(true);
    expect(r.stations.ZBAA.metar).toMatch(/^ZBAA/); // from the previous test's cache
    expect(r.stations.ZUDC).toBeUndefined();
    expect(r.message).toMatch(/could not be fetched/);
  });
});
