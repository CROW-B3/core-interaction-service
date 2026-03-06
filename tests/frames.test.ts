import { describe, expect, it } from 'vitest';
import { groupIntoPeriods, pickRepresentativeFrame } from '../src/lib/frames';

describe('groupIntoPeriods', () => {
  it('groups bucket_secs into 5-minute periods', () => {
    const bucketSecs = [3600, 3601, 3650, 3900, 3901, 4200];
    const periods = groupIntoPeriods(bucketSecs, 300);

    expect(periods.size).toBe(3);
    expect(periods.get(3600)).toEqual([3600, 3601, 3650]);
    expect(periods.get(3900)).toEqual([3900, 3901]);
    expect(periods.get(4200)).toEqual([4200]);
  });

  it('handles empty input', () => {
    const periods = groupIntoPeriods([], 300);
    expect(periods.size).toBe(0);
  });

  it('handles single frame', () => {
    const periods = groupIntoPeriods([7200], 300);
    expect(periods.size).toBe(1);
    expect(periods.get(7200)).toEqual([7200]);
  });

  it('uses custom period length', () => {
    const bucketSecs = [0, 100, 200, 300, 400, 500, 600];
    const periods = groupIntoPeriods(bucketSecs, 600);
    expect(periods.size).toBe(2);
    expect(periods.get(0)).toEqual([0, 100, 200, 300, 400, 500]);
    expect(periods.get(600)).toEqual([600]);
  });
});

describe('pickRepresentativeFrame', () => {
  it('picks middle frame', () => {
    expect(pickRepresentativeFrame([100, 200, 300, 400, 500])).toBe(300);
  });

  it('picks single frame', () => {
    expect(pickRepresentativeFrame([42])).toBe(42);
  });

  it('picks lower-middle for even count', () => {
    expect(pickRepresentativeFrame([100, 200, 300, 400])).toBe(300);
  });

  it('handles unsorted input', () => {
    expect(pickRepresentativeFrame([500, 100, 300])).toBe(300);
  });
});
