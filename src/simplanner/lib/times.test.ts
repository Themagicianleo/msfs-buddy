import { describe, expect, it } from 'vitest';
import { blockTimes, makeDepTime, suggestDeparture, zulu } from './times';

describe('departure and block times', () => {
  it('builds a UTC departure time from date and time fields', () => {
    expect(makeDepTime('2026-10-30', '09:30')).toBe('2026-10-30T09:30Z');
    expect(makeDepTime('2026-10-30', '0930z')).toBe('2026-10-30T09:30Z');
    expect(makeDepTime('2026-10-30', '7:05')).toBe('2026-10-30T07:05Z');
    expect(makeDepTime('2026-10-30', '25:00')).toBeNull();
    expect(makeDepTime('', '09:30')).toBeNull();
  });

  it('adds taxi out, trip and taxi in, across midnight', () => {
    const t = blockTimes('2026-10-30T23:30Z', 12, 51.4)!;
    expect([t.out, t.off, t.on, t.in].map(zulu)).toEqual(['2330Z', '2342Z', '0033Z', '0045Z']);
    expect(t.in.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(blockTimes(undefined, 12, 50)).toBeNull();
    expect(blockTimes('nonsense', 12, 50)).toBeNull();
  });

  it('suggests a departure on the next 5 minutes, 30 minutes ahead', () => {
    expect(suggestDeparture(new Date('2026-10-30T23:51:20Z'))).toEqual({ date: '2026-10-31', time: '00:25' });
  });
});
