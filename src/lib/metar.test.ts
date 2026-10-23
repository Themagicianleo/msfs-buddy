import { describe, expect, it } from 'vitest';
import { formatTaf, parseMetar, runwayHeading, splitReports, windComponents } from './metar';

const now = new Date(Date.UTC(2026, 9, 23, 12, 0));

describe('parseMetar', () => {
  it('decodes an ICAO-style METAR', () => {
    const m = parseMetar('EGLL 231150Z AUTO 24012G25KT 210V280 9999 -RA FEW012 BKN025 14/11 Q1009 NOSIG', now);
    expect(m.station).toBe('EGLL');
    expect(m.time?.toISOString()).toBe('2026-10-23T11:50:00.000Z');
    expect(m.wind).toMatchObject({ dir: 240, speed: 12, gust: 25, from: 210, to: 280 });
    expect(m.visibility?.meters).toBe(9999);
    expect(m.weather).toEqual(['-RA']);
    expect(m.clouds).toHaveLength(2);
    expect(m.ceiling).toBe(2500);
    expect(m.temp).toBe(14);
    expect(m.dewpoint).toBe(11);
    expect(m.qnh?.hpa).toBe(1009);
    expect(m.trend).toBe('NOSIG');
    expect(m.category).toBe('MVFR');
  });

  it('decodes a US METAR with split statute-mile visibility', () => {
    const m = parseMetar('METAR KJFK 231151Z 01008KT 1 1/2SM BR OVC004 M01/M02 A2992 RMK AO2 SLP132', now);
    expect(m.station).toBe('KJFK');
    expect(m.visibility?.meters).toBe(Math.round(1.5 * 1609.34));
    expect(m.temp).toBe(-1);
    expect(m.qnh?.inhg).toBe(29.92);
    expect(m.qnh?.hpa).toBe(1013);
    expect(m.remarks).toBe('AO2 SLP132');
    expect(m.category).toBe('LIFR');
  });

  it('treats CAVOK as VFR', () => {
    const m = parseMetar('LEBL 231200Z VRB03KT CAVOK 22/12 Q1018', now);
    expect(m.cavok).toBe(true);
    expect(m.wind?.variable).toBe(true);
    expect(m.category).toBe('VFR');
  });
});

describe('helpers', () => {
  it('computes wind components', () => {
    expect(windComponents(270, 20, 270)).toEqual({ headwind: 20, crosswind: 0 });
    expect(windComponents(360, 10, 270)).toEqual({ headwind: 0, crosswind: 10 });
    expect(windComponents(90, 10, 270).headwind).toBe(-10);
  });

  it('parses runway headings', () => {
    expect(runwayHeading('27L')).toBe(270);
    expect(runwayHeading('09')).toBe(90);
    expect(runwayHeading('RW36')).toBe(360);
    expect(runwayHeading('XX')).toBeNull();
  });

  it('splits multi-line reports', () => {
    const r = splitReports('TAF EGLL 231100Z 2312/2418 24012KT 9999 SCT030\n  TEMPO 2312/2316 7000 -RA\nTAF LFPG 231100Z 2312/2418 22010KT CAVOK');
    expect(r).toHaveLength(2);
    expect(r[0]).toContain('TEMPO');
  });

  it('formats TAF change groups', () => {
    expect(formatTaf('TAF EGLL 231100Z 2312/2418 24012KT 9999 BECMG 2318/2320 30010KT')).toContain('\n  BECMG');
  });
});
