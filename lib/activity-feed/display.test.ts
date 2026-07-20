import { describe, expect, it } from 'vitest';
import { activityPostAvatarUrl, activityPostCoachAvatarUrl, activityPostHeadline, activityPostSubline } from './display';
import { emptyKudosByReaction } from './kudos-reactions';
import type { ActivityFeedPost } from './types';

const createdPost: ActivityFeedPost = {
  id: 'post-1',
  trigger_type: 'session_created',
  created_at: '2026-07-20T14:00:00.000Z',
  coach_id: 'coach-1',
  session_id: 'session-1',
  athletes: {
    id: 'coach-1',
    first_name: 'Colton',
    last_name: 'Palmer',
    photo_url: 'https://example.com/coach.jpg',
  },
  sessions: {
    id: 'session-1',
    session_type: 'group',
    session_mode: 'partner-invite',
    scheduled_datetime: '2026-07-26T14:30:00.000Z',
    duration_minutes: 60,
    join_policy: 'public',
    facilities: { name: 'UNC Wrestling Facility' },
  },
  kudos_count: 0,
  kudos_by_reaction: emptyKudosByReaction(),
  viewer_reactions: [],
};

describe('session-created activity display', () => {
  it('uses coach-first copy and the coach photo as the primary avatar', () => {
    expect(activityPostHeadline(createdPost)).toBe('Colton Palmer created a new session');
    expect(activityPostSubline(createdPost)).toContain('Small Group');
    expect(activityPostSubline(createdPost)).toContain('UNC Wrestling Facility');
    expect(activityPostAvatarUrl(createdPost)).toBe('https://example.com/coach.jpg');
    expect(activityPostCoachAvatarUrl(createdPost)).toBeNull();
  });
});
