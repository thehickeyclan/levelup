import { describe, expect, it } from 'vitest';
import { summarizeCockpitAnalytics } from '@/lib/cockpit-vercel-analytics';

describe('summarizeCockpitAnalytics', () => {
  it('sums daily unique devices like Vercel dashboard visitors', () => {
    // Same device on two Eastern days → 2 visitors (daily), 1 period-unique
    const day1 = new Date('2026-07-01T16:00:00.000Z').getTime(); // Jul 1 ET noon
    const day2 = new Date('2026-07-02T16:00:00.000Z').getTime();
    const summary = summarizeCockpitAnalytics(
      [
        { device_id: 42, timestamp_ms: day1 },
        { device_id: 42, timestamp_ms: day2 },
        { device_id: 99, timestamp_ms: day2 },
      ],
      false
    );
    expect(summary.visitors).toBe(3);
    expect(summary.periodUniqueDevices).toBe(2);
    expect(summary.pageViews).toBe(3);
  });
});
