import { describe, it, expect } from 'vitest';
import { resolveCockpitRange, parseCockpitPeriod } from './cockpit-date-ranges';

const TZ = 'America/New_York';

describe('parseCockpitPeriod', () => {
  it('prefers period param', () => {
    expect(parseCockpitPeriod('year', 'today', '7d')).toBe('year');
    expect(parseCockpitPeriod('90d', null, null)).toBe('90d');
  });

  it('falls back to legacy range/trend', () => {
    expect(parseCockpitPeriod(null, 'week', '7d')).toBe('week');
    expect(parseCockpitPeriod(null, 'today', '90d')).toBe('90d');
    expect(parseCockpitPeriod(null, 'today', '12m')).toBe('year');
  });
});

describe('resolveCockpitRange', () => {
  it('today is a single day', () => {
    const r = resolveCockpitRange('today', '2026-05-31', TZ);
    expect(r.rangeStart).toBe('2026-05-31');
    expect(r.rangeEnd).toBe('2026-05-31');
    expect(r.trendRanges).toHaveLength(1);
  });

  it('week starts on Sunday in Eastern', () => {
    // 2026-05-31 is a Sunday
    const r = resolveCockpitRange('week', '2026-05-31', TZ);
    expect(r.rangeStart).toBe('2026-05-31');
    expect(r.rangeEnd).toBe('2026-05-31');
    // Wednesday May 27 2026 — week starts Sun May 24
    const mid = resolveCockpitRange('week', '2026-05-27', TZ);
    expect(mid.rangeStart).toBe('2026-05-24');
    expect(mid.rangeEnd).toBe('2026-05-27');
    expect(mid.trendRanges).toHaveLength(4);
  });

  it('month starts on the 1st in Eastern', () => {
    const r = resolveCockpitRange('month', '2026-05-15', TZ);
    expect(r.rangeStart).toBe('2026-05-01');
    expect(r.rangeEnd).toBe('2026-05-15');
    expect(r.trendRanges).toHaveLength(15);
  });

  it('90d is 90 inclusive days ending on anchor', () => {
    const r = resolveCockpitRange('90d', '2026-05-31', TZ);
    expect(r.rangeStart).toBe('2026-03-03');
    expect(r.rangeEnd).toBe('2026-05-31');
    expect(r.trendRanges).toHaveLength(90);
  });

  it('year is Jan 1 through anchor with monthly buckets', () => {
    const r = resolveCockpitRange('year', '2026-05-31', TZ);
    expect(r.rangeStart).toBe('2026-01-01');
    expect(r.rangeEnd).toBe('2026-05-31');
    expect(r.trendRanges).toHaveLength(5);
    expect(r.trendRanges[0].label).toMatch(/Jan/);
    expect(r.trendRanges[4].label).toMatch(/May/);
  });
});
