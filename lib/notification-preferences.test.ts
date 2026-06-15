import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
  patchNotificationPreferences,
  wantsNewSessionSms,
} from './notification-preferences';
import { buildNewSessionSmsBody, isSessionAlertable } from './notify-session-scheduled-followers';

describe('notification-preferences', () => {
  it('defaults when null', () => {
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('merges partial stored prefs', () => {
    expect(parseNotificationPreferences({ new_sessions_sms: false })).toMatchObject({
      new_sessions_sms: false,
      reminders_sms: true,
    });
  });

  it('patches boolean keys only', () => {
    const next = patchNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, {
      sms_opted_out: true,
      new_sessions_sms: false,
    });
    expect(next.sms_opted_out).toBe(true);
    expect(next.new_sessions_sms).toBe(false);
    expect(next.reminders_sms).toBe(true);
  });

  it('sms opt-out blocks new session texts', () => {
    expect(wantsNewSessionSms({ ...DEFAULT_NOTIFICATION_PREFERENCES, sms_opted_out: true })).toBe(false);
    expect(wantsNewSessionSms({ ...DEFAULT_NOTIFICATION_PREFERENCES, new_sessions_sms: false })).toBe(false);
    expect(wantsNewSessionSms(DEFAULT_NOTIFICATION_PREFERENCES)).toBe(true);
  });
});

describe('notify-session-scheduled-followers helpers', () => {
  it('only public scheduled sessions are alertable', () => {
    expect(isSessionAlertable('public', 'scheduled')).toBe(true);
    expect(isSessionAlertable('invite_only', 'scheduled')).toBe(false);
    expect(isSessionAlertable('private', 'scheduled')).toBe(false);
    expect(isSessionAlertable('public', 'cancelled')).toBe(false);
  });

  it('builds SMS with coach, time ET, facility, spots, price, and STOP', () => {
    const body = buildNewSessionSmsBody(
      {
        id: 'sess-1',
        athlete_id: 'coach-1',
        status: 'scheduled',
        join_policy: 'public',
        session_type: 'group',
        session_mode: 'partner-invite',
        scheduled_datetime: '2026-05-17T14:00:00.000Z',
        max_participants: 8,
        current_participants: 2,
        price_per_participant: 30,
        partner_invite_code: 'ABC',
        facilities: { name: 'UNC Wrestling Facility' },
      },
      'Liam Hickey',
      'Cardinal Gibbons'
    );
    expect(body).toContain('New session from Liam Hickey · Cardinal Gibbons');
    expect(body).toContain('Small Group');
    expect(body).toContain('ET');
    expect(body).toContain('UNC Wrestling Facility');
    expect(body).toContain('6 spots');
    expect(body).toContain('$30');
    expect(body).toContain('/sessions/sess-1');
    expect(body).toContain('Reply STOP to unsubscribe');
  });
});
