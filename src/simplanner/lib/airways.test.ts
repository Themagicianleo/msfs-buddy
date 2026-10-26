import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AirwayGraph, extractAirways } from './airways';
import { distanceNm } from './geo';
import { customWaypointProvider } from './navdata';
import { parseRoute } from './route';
import { bufferSource, parseColumns, SqliteFile } from './sqlite';

// Made-up airways in Little Navmap's database layout (scripts/make-airway-fixture.py).
const FILE = new Uint8Array(readFileSync(new URL('./fixtures/airways.sqlite', import.meta.url)));
const ZUDC = { lat: 29.3233, lon: 100.0533 };
const ZUNZ = { lat: 29.3033, lon: 94.3353 };

describe('SQLite reader', () => {
  it('lists tables with their columns', async () => {
    const db = await SqliteFile.open(bufferSource(FILE));
    expect(db.pageSize).toBe(1024);
    const t = await db.tables();
    expect([...t.keys()].sort()).toEqual(['airway', 'filler', 'metadata', 'waypoint']);
    expect(t.get('waypoint')!.columns.slice(0, 4)).toEqual(['waypoint_id', 'file_id', 'nav_id', 'ident']);
    expect(t.get('waypoint')!.rowidColumn).toBe(0);
  });

  it('reads every row of a multi-page table, including overflow pages and all number types', async () => {
    const db = await SqliteFile.open(bufferSource(FILE));
    const filler = (await db.tables()).get('filler')!;
    const rows: Record<string, unknown>[] = [];
    await db.rows(filler, ['filler_id', 'note', 'big', 'neg', 'f'] as const, (r) => rows.push(r));
    expect(rows).toHaveLength(1500);
    const r97 = rows.find((r) => r.filler_id === 97)!;
    expect(r97).toMatchObject({ filler_id: 97, big: 97 * 1_000_000_007, neg: -97 * 300 });
    expect(r97.note).toBe('long text 97 '.repeat(300)); // overflowed onto other pages
    expect(rows.find((r) => r.filler_id === 1500)!.f).toBeCloseTo(1500 / 7, 10);
  });

  it('rejects files that are not SQLite', async () => {
    await expect(SqliteFile.open(bufferSource(new TextEncoder().encode('x'.repeat(200))))).rejects.toThrow(/not an SQLite/);
  });

  it('parses CREATE TABLE column lists', () => {
    expect(parseColumns('create table t (a integer primary key, b varchar(5) not null, -- note, with comma\n c double, foreign key(b) references x(y))')).toEqual({ columns: ['a', 'b', 'c'], rowidColumn: 0 });
  });
});

describe('airway routing', async () => {
  const data = await extractAirways(bufferSource(FILE), 'airways.sqlite');
  const graph = new AirwayGraph(data);

  it('extracts the airway network and metadata', () => {
    expect(data).toMatchObject({ dataSource: 'MSFS24', cycle: '2610', airwayNames: ['T1', 'T2', 'T9', 'T5'] });
    expect(graph.segmentCount).toBe(9);
    expect(graph.fixCount).toBe(10);
  });

  it('finds the shortest airway route, joining it ahead of the airport (TSTAA is behind ZUDC)', () => {
    const r = graph.route(ZUDC, ZUNZ)!;
    expect(r.route).toBe('TSTAB T1 TVR T2 TSTAF');
    expect(r.airways).toEqual(['T1', 'T2']);
    expect(r.routeNm).toBeGreaterThan(r.directNm);
    expect(r.note).toMatch(/MSFS24 cycle 2610/);
  });

  it('respects one-way airways', () => {
    const east = graph.route({ lat: 28.8, lon: 94.7 }, { lat: 28.8, lon: 100.4 })!;
    expect(east.route).toBe('TSTOB T5 TSTOA');
    const west = graph.route({ lat: 28.8, lon: 100.4 }, { lat: 28.8, lon: 94.7 });
    expect(west?.route ?? '').not.toContain('T5');
  });

  it('returns null when no airway is near an airport', () => {
    expect(graph.route({ lat: 0, lon: 0 }, ZUNZ)).toBeNull();
  });

  it('lets the route parser resolve the fixes and draw the airway legs', () => {
    const dep = { ident: 'ZUDC', ...ZUDC, type: 'airport' as const, source: 'test' };
    const arr = { ident: 'ZUNZ', ...ZUNZ, type: 'airport' as const, source: 'test' };
    const parsed = parseRoute('TSTAB T1 TVR T2 TSTAF', [customWaypointProvider([]), graph.provider()], dep, arr);
    expect(parsed.tokens.filter((t) => t.kind === 'unknown')).toEqual([]);
    expect(parsed.points.map((p) => p.ident)).toEqual(['ZUDC', 'TSTAB', 'TSTAC', 'TVR', 'TSTAE', 'TSTAF', 'ZUNZ']);
    expect(parsed.points[2].via).toBe('T1'); // TSTAC, inside the T1 leg
    expect(parsed.warnings.join(' ')).not.toMatch(/Airway segments are flown direct/);
    expect(parsed.totalNm).toBeCloseTo(graph.route(ZUDC, ZUNZ)!.routeNm, 0);
    expect(parsed.totalNm).toBeGreaterThan(distanceNm(ZUDC, ZUNZ));
  });
});
