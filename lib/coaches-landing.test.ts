import { describe, expect, it } from 'vitest';
import {
  buildCoachesEarningsScenarios,
  formatBookingDollarsStat,
  formatCountStat,
} from './coaches-landing';

describe('buildCoachesEarningsScenarios', () => {
  it('computes monthly scenarios from tenant pricing', () => {
    const rows = buildCoachesEarningsScenarios({ oneOnOne: 60, groupRate: 30 });
    expect(rows).toHaveLength(4);
    expect(rows[0].label).toBe('2 privates/week');
    expect(rows[0].monthlyApprox).toBeGreaterThan(0);
    expect(rows[2].label).toContain('6 athletes');
  });
});

describe('formatBookingDollarsStat', () => {
  it('rounds down to whole thousands with k+', () => {
    expect(formatBookingDollarsStat(10250)).toBe('$10k+');
    expect(formatBookingDollarsStat(19999)).toBe('$19k+');
    expect(formatBookingDollarsStat(1000)).toBe('$1k+');
  });

  it('shows dollars under 1k without inventing a k', () => {
    expect(formatBookingDollarsStat(850)).toBe('$850+');
    expect(formatBookingDollarsStat(0)).toBe('$0');
  });
});

describe('formatCountStat', () => {
  it('floors to tens for larger counts', () => {
    expect(formatCountStat(304)).toBe('300+');
    expect(formatCountStat(94)).toBe('90+');
    expect(formatCountStat(100)).toBe('100+');
  });

  it('shows exact small counts', () => {
    expect(formatCountStat(12)).toBe('12+');
    expect(formatCountStat(0)).toBe('0');
  });
});
