import { describe, expect, it } from 'vitest';
import { canonicalCoachConversationPair } from './coach-peer-message';

describe('canonicalCoachConversationPair', () => {
  it('returns the same pair regardless of who starts the conversation', () => {
    expect(canonicalCoachConversationPair('coach-b', 'coach-a')).toEqual([
      'coach-a',
      'coach-b',
    ]);
    expect(canonicalCoachConversationPair('coach-a', 'coach-b')).toEqual([
      'coach-a',
      'coach-b',
    ]);
  });

  it('rejects self-messaging', () => {
    expect(() => canonicalCoachConversationPair('coach-a', 'coach-a')).toThrow(
      'cannot message themselves'
    );
  });
});
