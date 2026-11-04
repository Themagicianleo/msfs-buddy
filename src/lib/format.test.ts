import { describe, expect, it } from 'vitest';
import { fmtDistance, fmtFtM, nmToKm } from './format';

describe('distances in nm and km', () => {
  it('converts with 1 nm = 1.852 km and shows both', () => {
    expect(nmToKm(1)).toBe(1.852);
    expect(fmtDistance(333)).toBe('333 nm · 617 km');
    expect(fmtDistance(1285.4)).toBe('1,285 nm · 2,381 km');
    expect(fmtDistance(null)).toBe('—');
  });
});

describe('heights in ft and m', () => {
  it('shows feet with metres alongside', () => {
    expect(fmtFtM(14472)).toBe('14,472 ft · 4,411 m');
    expect(fmtFtM(null)).toBe('—');
  });
});
