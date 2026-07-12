import { describe, it, expect } from 'vitest';
import { buildActivityPostShareCaption } from './share-caption';
import { emptyKudosByReaction } from './kudos-reactions';
import type { ActivityFeedPost } from './types';

const basePost: ActivityFeedPost = {
  id: 'post-1',
  trigger_type: 'session_completed',
  created_at: '2026-07-12T18:00:00.000Z',
  coach_id: 'coach-1',
  session_id: 'sess-1',
  youth_wrestler_id: 'yw-1',
  kudos_count: 0,
  kudos_by_reaction: emptyKudosByReaction(),
  viewer_reactions: [],
  youth_wrestlers: { id: 'yw-1', first_name: 'Gavin', last_name: 'Hickey' },
  athletes: { id: 'coach-1', first_name: 'Liam', last_name: 'Hickey' },
  sessions: {
    id: 'sess-1',
    session_type: 'small_group',
    session_mode: 'in_person',
    scheduled_datetime: '2026-07-12T14:30:00.000Z',
    duration_minutes: 60,
    facilities: { name: 'UNC Wrestling Facility' },
  },
};

describe('buildActivityPostShareCaption', () => {
  it('includes coach booking link for session completed', () => {
    const caption = buildActivityPostShareCaption(basePost, 'https://wrestlingguild.com');
    expect(caption).toContain('Liam Hickey');
    expect(caption).toContain('https://wrestlingguild.com/sessions/sess-1/register');
    expect(caption).toContain('UNC Wrestling Facility');
  });

  it('builds milestone caption with schedule link', () => {
    const post: ActivityFeedPost = {
      ...basePost,
      trigger_type: 'milestone_hit',
      session_id: null,
      sessions: null,
      reward_milestones: { id: 'ms-1', milestone: 'sessions_10' },
    };
    const caption = buildActivityPostShareCaption(post, 'https://wrestlingguild.com');
    expect(caption).toContain('10 sessions');
    expect(caption).toContain('https://wrestlingguild.com/coach/coach-1');
  });

  it('includes photo caption and session link for photo posts', () => {
    const post: ActivityFeedPost = {
      ...basePost,
      trigger_type: 'photo_post',
      caption: 'Double leg was clicking today',
      photos: [{ id: 'ph-1', storage_path: 'a.jpg', display_order: 0, url: 'https://cdn/a.jpg' }],
    };
    const caption = buildActivityPostShareCaption(post, 'https://wrestlingguild.com');
    expect(caption).toContain('shared session photos');
    expect(caption).toContain('Double leg was clicking today');
    expect(caption).toContain('https://wrestlingguild.com/sessions/sess-1/register');
  });
});
