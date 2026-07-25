import { describe, expect, it } from 'vitest';
import {
  buildCoachOneHourReminderBody,
  isInCoachOneHourReminderWindow,
} from './coach-session-reminder';

describe('coach one-hour session reminders', () => {
  const now = Date.parse('2026-07-25T14:00:00.000Z');

  it('accepts sessions in the 55–65 minute delivery window', () => {
    expect(isInCoachOneHourReminderWindow('2026-07-25T14:55:00.000Z', now)).toBe(true);
    expect(isInCoachOneHourReminderWindow('2026-07-25T15:05:00.000Z', now)).toBe(true);
  });

  it('rejects sessions outside the one-hour delivery window', () => {
    expect(isInCoachOneHourReminderWindow('2026-07-25T14:54:59.000Z', now)).toBe(false);
    expect(isInCoachOneHourReminderWindow('2026-07-25T15:05:01.000Z', now)).toBe(false);
    expect(isInCoachOneHourReminderWindow('not-a-date', now)).toBe(false);
  });

  it('builds a coach-specific reminder with time, type, location, and session link', () => {
    const body = buildCoachOneHourReminderBody({
      scheduledDatetime: '2026-07-25T15:00:00.000Z',
      sessionType: 'small_group',
      facilityName: 'Harrisburg',
      sessionUrl: 'https://www.wrestlingguild.com/athlete-dashboard?session=abc',
    });

    expect(body).toContain('Small Group');
    expect(body).toContain('11:00 AM');
    expect(body).toContain('Harrisburg');
    expect(body).toContain('session=abc');
  });
});
