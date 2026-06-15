import { describe, it, expect } from 'vitest';
import {
  COACH_NOTIFICATION_TYPES,
  filterNotificationsForAudience,
  resolveNotificationUserId,
} from './notification-audience';

describe('notification-audience', () => {
  it('filters parent follower alerts out of coach inbox', () => {
    const rows = [
      { id: '1', type: 'coach_new_session', title: 'Liam', read_at: null, created_at: '' },
      { id: '2', type: 'session_booked', title: 'Booking', read_at: null, created_at: '' },
    ];
    const filtered = filterNotificationsForAudience(rows, {
      authUserId: 'coach-1',
      userRole: 'coach',
      viewAsRole: null,
      viewAsCoachId: null,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe('session_booked');
  });

  it('admin preview-as-coach reads that coach user id', () => {
    expect(
      resolveNotificationUserId({
        authUserId: 'admin-1',
        userRole: 'admin',
        viewAsRole: 'coach',
        viewAsCoachId: 'coach-liam',
      })
    ).toBe('coach-liam');
  });

  it('includes payout recorded in coach allowlist', () => {
    expect(COACH_NOTIFICATION_TYPES.has('session_payout_recorded')).toBe(true);
  });
});
