import { describe, expect, it } from 'vitest';
import { describeLoad, fitPayload, randomPayload, seededRng, triangular } from './payload';
import { computePlan } from './planning';
import { DEFAULT_PROFILES } from './profiles';
import { defaultInputs } from '../state';

const b738 = DEFAULT_PROFILES.find((p) => p.id === 'pmdg-737-800')!;

describe('random payload', () => {
  it('is repeatable with a seed and stays in range', () => {
    const a = randomPayload(b738, defaultInputs(b738), seededRng(42));
    const b = randomPayload(b738, defaultInputs(b738), seededRng(42));
    expect(a).toEqual(b);
    for (let s = 1; s < 300; s++) {
      const r = randomPayload(b738, defaultInputs(b738), seededRng(s));
      expect(r.paxCount).toBeGreaterThanOrEqual(Math.floor(b738.capacity.maxPax * 0.55));
      expect(r.paxCount).toBeLessThanOrEqual(b738.capacity.maxPax);
      expect(r.cargo).toBeGreaterThanOrEqual(0);
      expect(r.cargo).toBeLessThanOrEqual(b738.capacity.maxCargo * 0.7);
      expect(r.cargo % 10).toBe(0);
    }
  });

  it('looks like airline loads: mostly 75–95%', () => {
    const rng = seededRng(7);
    const samples = Array.from({ length: 2000 }, () => triangular(rng, 0.55, 0.85, 1));
    const mean = samples.reduce((x, y) => x + y, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.78);
    expect(mean).toBeLessThan(0.82);
    expect(samples.filter((x) => x >= 0.75 && x <= 0.95).length / samples.length).toBeGreaterThan(0.5);
  });

  it('uses the flight units for cargo', () => {
    const kg = randomPayload(b738, defaultInputs(b738), seededRng(3));
    const lb = randomPayload(b738, { ...defaultInputs(b738), units: 'lb' }, seededRng(3));
    expect(lb.cargo / kg.cargo).toBeCloseTo(2.2046, 1);
  });

  it('trims cargo, then passengers, until the weights fit', () => {
    const heavy = { ...defaultInputs(b738), paxCount: b738.capacity.maxPax, cargo: b738.capacity.maxCargo };
    const before = computePlan(heavy, b738, 2900, 150);
    expect(before.exceeded.length).toBeGreaterThan(0);
    const fit = fitPayload(heavy, b738, 2900, 150, {});
    expect(fit.trimmed).toBe(true);
    const after = computePlan({ ...heavy, ...fit }, b738, 2900, 150);
    expect(after.exceeded.filter((l) => ['Zero fuel weight', 'Takeoff weight', 'Landing weight'].includes(l.name))).toEqual([]);
    expect(fit.cargo).toBeLessThan(heavy.cargo);
  });

  it('leaves a load that already fits alone', () => {
    const light = { ...defaultInputs(b738), paxCount: 100, cargo: 500 };
    expect(fitPayload(light, b738, 400, 80, {})).toEqual({ paxCount: 100, cargo: 500, trimmed: false });
  });

  it('describes the load', () => {
    expect(describeLoad(150, 2340, 189, 'kg', false)).toBe('Random load: 150 passengers (79% of 189 seats) and 2,340 kg of cargo.');
  });
});
