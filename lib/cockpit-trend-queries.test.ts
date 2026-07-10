import { describe, expect, it } from 'vitest';
import {
  bucketCountsByRanges,
  bucketSumAmountPaidByRanges,
  cumulativeCountsAtRangeEnds,
} from './cockpit-trend-queries';

describe('cockpit-trend-queries', () => {
  const ranges = [
    { start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T23:59:59.999Z' },
    { start: '2026-01-02T00:00:00.000Z', end: '2026-01-02T23:59:59.999Z' },
  ];

  it('buckets timestamps into ranges', () => {
    const counts = bucketCountsByRanges(
      ['2026-01-01T12:00:00.000Z', '2026-01-02T12:00:00.000Z', '2026-01-02T18:00:00.000Z'],
      ranges
    );
    expect(counts).toEqual([1, 2]);
  });

  it('computes cumulative counts', () => {
    const cum = cumulativeCountsAtRangeEnds(
      ['2026-01-01T12:00:00.000Z', '2026-01-02T12:00:00.000Z'],
      ranges,
      1
    );
    expect(cum[0]).toBe(2);
    expect(cum[1]).toBe(3);
  });

  it('sums amount_paid per bucket', () => {
    const sums = bucketSumAmountPaidByRanges(
      [
        { amount_paid: 10, created_at: '2026-01-01T12:00:00.000Z' },
        { amount_paid: 25, created_at: '2026-01-02T12:00:00.000Z' },
      ],
      ranges
    );
    expect(sums[0]).toBe(10);
    expect(sums[1]).toBe(25);
  });
});
