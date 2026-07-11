import { describe, it, expect } from 'vitest';
import { suggestSessionIdFromPhotoTime } from './suggest-photo-session';

describe('suggestSessionIdFromPhotoTime', () => {
  it('picks the session closest to photo time within 8 hours', () => {
    const sessions = [
      { id: 'a', scheduled_datetime: '2026-07-12T14:30:00.000Z' },
      { id: 'b', scheduled_datetime: '2026-07-11T14:30:00.000Z' },
    ];
    const photoAt = new Date('2026-07-12T15:00:00.000Z');
    expect(suggestSessionIdFromPhotoTime(sessions, photoAt)).toBe('a');
  });

  it('returns null when no session is within 8 hours', () => {
    const sessions = [{ id: 'a', scheduled_datetime: '2026-07-01T14:30:00.000Z' }];
    const photoAt = new Date('2026-07-12T15:00:00.000Z');
    expect(suggestSessionIdFromPhotoTime(sessions, photoAt)).toBeNull();
  });
});
