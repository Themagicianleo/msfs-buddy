import { describe, expect, it } from 'vitest';
import { duration, emptyEntry, mergeEntries, parseBackup, stats, toBackup, toCsv, type LogEntry } from './logbook';

const entry = (over: Partial<LogEntry>): LogEntry => ({ ...emptyEntry(), ...over });

describe('logbook', () => {
  it('computes durations across midnight', () => {
    expect(duration('10:05', '12:20')).toBe(135);
    expect(duration('23:40', '01:10')).toBe(90);
    expect(duration('', '01:10')).toBeNull();
    expect(duration('25:00', '01:10')).toBeNull();
  });

  it('totals flights', () => {
    const s = stats([
      entry({ aircraft: 'A20N', dep: 'EGLL', arr: 'LEBL', out: '10:00', in: '12:05', off: '10:15', on: '11:55', distance: 643, landingRate: 120 }),
      entry({ aircraft: 'A20N', dep: 'LEBL', arr: 'EGLL', out: '13:00', in: '15:00', distance: 640, landingRate: 280 }),
      entry({ aircraft: 'B738', dep: 'EGLL', arr: 'EIDW' }),
    ]);
    expect(s.flights).toBe(3);
    expect(s.blockMinutes).toBe(245);
    expect(s.airMinutes).toBe(100);
    expect(s.distance).toBe(1283);
    expect(s.avgLandingRate).toBe(200);
    expect(s.topAircraft).toBe('A20N');
    expect(s.topAirport).toBe('EGLL');
  });

  it('exports CSV with escaping', () => {
    const csv = toCsv([entry({ dep: 'EGLL', arr: 'LEBL', remarks: 'Gusty, "fun"' })]);
    expect(csv.split('\n')[0]).toMatch(/^Date,Callsign/);
    expect(csv).toContain('"Gusty, ""fun"""');
  });

  it('round-trips a backup and merges by id', () => {
    const a = entry({ id: 'a', dep: 'EGLL', arr: 'LEBL' });
    const restored = parseBackup(toBackup([a]));
    expect(restored).toEqual([a]);
    const merged = mergeEntries([a, entry({ id: 'b' })], [{ ...a, remarks: 'edited' }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === 'a')?.remarks).toBe('edited');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow();
    expect(() => parseBackup('{"foo":1}')).toThrow();
  });
});
