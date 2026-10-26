import { describe, expect, it } from 'vitest';
import { addLists, findPublishedRoutes, parseCaacRoutes } from './caac';

// Made-up samples in the layout of CAAC's route lists (not real routes).
const FROM = `Flight Routes for International Flights from Mainland of China Nr2610 (EFF202609301600UTC),,\r
Route Code,Destination AD,Fly along,\r
ZUUU-EXITA-01,RKSI RKSS,AAAAA W1 BBB W2 EXITA,\r
ZUUU-EXITA-02,RKSI,CCCCC W3 EXITA,\r
ZUUU-EXITB-01R,VNKT,DDDDD B9 EXITB,\r
BAD-ROW,,,\r
`;
const TO = `Flight Routes for International Flights to Mainland of China Nr2610 (EFF202609301600UTC),,
Route Code,Departure AD,Fly along,
ENTRA-ZUUU-01,RKSI,ENTRA W1 BBB W2 FFFFF,
`;
const REGIONAL = `Flight Routes for Regional Flight Routes Nr2610 (EFF202609301600UTC),
Route Code,Fly along,
VHHH-ZUUU-01,GGGGG A1 HHHHH,
`;
const OVER = `Overflying Flight Routes (EFF202609301600UTC),
Route Code,Fly along
ENTRA-EXITA,ENTRA W1 EXITA/ENTRA W2 EXITA
`;

describe('CAAC route lists', () => {
  it('reads the three list types with cycle and effective date', () => {
    const from = parseCaacRoutes(FROM);
    expect(from).toMatchObject({ kind: 'from', cycle: '2610', effective: '2026-09-30' });
    expect(from.routes.map((r) => r.code)).toEqual(['ZUUU-EXITA-01', 'ZUUU-EXITA-02', 'ZUUU-EXITB-01R']);
    expect(from.routes[0]).toMatchObject({ from: 'ZUUU', to: 'EXITA', airports: ['RKSI', 'RKSS'], route: 'AAAAA W1 BBB W2 EXITA' });
    expect(parseCaacRoutes(TO).kind).toBe('to');
    expect(parseCaacRoutes(REGIONAL).routes[0]).toMatchObject({ kind: 'regional', from: 'VHHH', to: 'ZUUU' });
  });

  it('rejects overflight lists and other files', () => {
    expect(() => parseCaacRoutes(OVER)).toThrow(/Overflight/);
    expect(() => parseCaacRoutes('a,b\n1,2')).toThrow(/not a CAAC/);
  });

  it('finds routes for an airport pair in either direction', () => {
    const lib = addLists(null, [parseCaacRoutes(FROM), parseCaacRoutes(TO), parseCaacRoutes(REGIONAL)]);
    expect(findPublishedRoutes(lib, 'zuuu', 'rksi').map((r) => r.code)).toEqual(['ZUUU-EXITA-01', 'ZUUU-EXITA-02']);
    expect(findPublishedRoutes(lib, 'ZUUU', 'RKSS').map((r) => r.code)).toEqual(['ZUUU-EXITA-01']);
    expect(findPublishedRoutes(lib, 'RKSI', 'ZUUU').map((r) => r.code)).toEqual(['ENTRA-ZUUU-01']);
    expect(findPublishedRoutes(lib, 'VHHH', 'ZUUU').map((r) => r.code)).toEqual(['VHHH-ZUUU-01']);
    expect(findPublishedRoutes(lib, 'ZUDC', 'ZUNZ')).toEqual([]);
    expect(findPublishedRoutes(null, 'ZUUU', 'RKSI')).toEqual([]);
  });

  it('replaces a list of the same kind on re-import', () => {
    const lib = addLists(addLists(null, [parseCaacRoutes(FROM), parseCaacRoutes(TO)]), [parseCaacRoutes(FROM.replace('Nr2610', 'Nr2611'))]);
    expect(lib.lists.map((l) => [l.kind, l.cycle])).toEqual([['to', '2610'], ['from', '2611']]);
  });
});
