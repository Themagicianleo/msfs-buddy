import { describe, expect, it } from 'vitest';
import { buildDemoOfp } from '../sample/demoOfp';
import { normalise } from './simbrief';
import { normaliseOpenAtcUrl, openAtcCode, openAtcLink, toOpenAtcPlan } from './openatc';

const plan = normalise(buildDemoOfp());

describe('OpenATC hand-over', () => {
  it('maps the EFB flight to OpenATC form fields', () => {
    const fp = toOpenAtcPlan(plan);
    expect(fp).toMatchObject({ v: 1, callsign: 'BAW478', dep: 'EGLL', arr: 'LEBL', cruise: 'FL360', region: 'icao', depRunway: '27R', arrRunway: '24R' });
    expect(fp.sid).toBe('MID2G');
    expect(fp.route).toContain('UL612');
    expect(Object.values(fp)).not.toContain(undefined);
  });

  it('picks China phraseology for mainland Chinese airports', () => {
    const cn = { ...plan, origin: { ...plan.origin, icao: 'ZUDC' }, destination: { ...plan.destination, icao: 'ZUNZ' } };
    expect(toOpenAtcPlan(cn).region).toBe('china');
    expect(toOpenAtcPlan({ ...cn, origin: { ...cn.origin, icao: 'ZKPY' }, destination: { ...cn.destination, icao: 'VHHH' } }).region).toBe('icao');
  });

  it('encodes a code and a link OpenATC can read', () => {
    const code = openAtcCode(plan);
    expect(code).toMatch(/^OPENATC1:[A-Za-z0-9_-]+$/);
    const json = JSON.parse(Buffer.from(code.slice(9), 'base64url').toString('utf8'));
    expect(json).toEqual(toOpenAtcPlan(plan));
    expect(openAtcLink('192.168.1.50', plan)).toBe(`https://192.168.1.50:8443/#fp=${code.slice(9)}`);
    expect(openAtcLink('', plan)).toBeNull();
  });

  it('accepts the address as shown in the helper window', () => {
    expect(normaliseOpenAtcUrl('https://192.168.1.50:8443/')).toBe('https://192.168.1.50:8443/');
    expect(normaliseOpenAtcUrl('192.168.1.50:8443')).toBe('https://192.168.1.50:8443/');
    expect(normaliseOpenAtcUrl('http://127.0.0.1:8443')).toBe('http://127.0.0.1:8443/');
    expect(normaliseOpenAtcUrl('not a url ::')).toBeNull();
  });
});
