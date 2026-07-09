import { describe, expect, it } from 'vitest';
import {
  buildCreateSessionPrefillUrl,
  computeActivationSteps,
  isCoreActivationComplete,
  shouldShowSlotNudges,
  suggestOpenSlots,
} from './coach-activation';

describe('buildCreateSessionPrefillUrl', () => {
  it('builds query params for create session pre-fill', () => {
    expect(
      buildCreateSessionPrefillUrl({ type: 'small_group', date: '2026-07-15', time: '18:00' })
    ).toBe('/coach-sessions/create?type=small_group&date=2026-07-15&time=18%3A00');
  });
});

describe('computeActivationSteps', () => {
  it('marks bookable when upcoming session exists', () => {
    const steps = computeActivationSteps({
      profileComplete: true,
      hasRateCard: true,
      hasCalendar: true,
      isBookable: true,
      coachId: 'coach-1',
    });
    expect(steps.find((s) => s.id === 'bookable')?.done).toBe(true);
    expect(isCoreActivationComplete(steps)).toBe(true);
  });
});

describe('shouldShowSlotNudges', () => {
  it('shows when calendar exists but no public sessions and not fully activated', () => {
    expect(
      shouldShowSlotNudges({
        hasCalendar: true,
        upcomingPublicSessionCount: 0,
      })
    ).toBe(true);
  });

  it('still shows when activation is complete but no public sessions', () => {
    expect(
      shouldShowSlotNudges({
        hasCalendar: true,
        upcomingPublicSessionCount: 0,
      })
    ).toBe(true);
  });
});

describe('suggestOpenSlots', () => {
  it('suggests an open Tuesday evening window', () => {
    // 2026-07-07 is a Tuesday in Eastern
    const now = new Date('2026-07-07T14:00:00.000Z');
    const suggestions = suggestOpenSlots({
      weeklyWindows: [{ day_of_week: 2, start_time: '18:00:00', end_time: '20:00:00' }],
      upcomingSessions: [],
      now,
      horizonDays: 7,
      maxSuggestions: 1,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.date).toBe('2026-07-07');
    expect(suggestions[0]?.time).toBe('18:00');
    expect(suggestions[0]?.createUrl).toContain('type=small_group');
  });

  it('skips windows blocked by an existing session on the same day', () => {
    const now = new Date('2026-07-07T14:00:00.000Z');
    const suggestions = suggestOpenSlots({
      weeklyWindows: [{ day_of_week: 2, start_time: '18:00:00', end_time: '20:00:00' }],
      upcomingSessions: [
        {
          scheduled_datetime: '2026-07-07T22:00:00.000Z',
          duration_minutes: 60,
        },
      ],
      now,
      horizonDays: 0,
      maxSuggestions: 1,
    });
    expect(suggestions).toHaveLength(0);
  });
});
