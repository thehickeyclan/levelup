export const ACTIVITY_REACTION_IDS = ['fire', 'thumbs_up', 'hammer', 'heart'] as const;

export type ActivityReactionId = (typeof ACTIVITY_REACTION_IDS)[number];

export type ActivityKudosByReaction = Record<ActivityReactionId, number>;

export const ACTIVITY_REACTIONS: Record<
  ActivityReactionId,
  { emoji: string; ariaLabel: string }
> = {
  fire: { emoji: '🔥', ariaLabel: 'React with fire' },
  thumbs_up: { emoji: '👍', ariaLabel: 'React with thumbs up' },
  hammer: { emoji: '🔨', ariaLabel: 'React with hammer' },
  heart: { emoji: '❤️', ariaLabel: 'React with heart' },
};

export function emptyKudosByReaction(): ActivityKudosByReaction {
  return { fire: 0, thumbs_up: 0, hammer: 0, heart: 0 };
}

export function isActivityReactionId(value: string): value is ActivityReactionId {
  return (ACTIVITY_REACTION_IDS as readonly string[]).includes(value);
}

export function normalizeActivityReactionId(value: unknown): ActivityReactionId {
  const raw = String(value ?? '').trim();
  return isActivityReactionId(raw) ? raw : 'hammer';
}

export function totalKudosCount(byReaction: ActivityKudosByReaction): number {
  return ACTIVITY_REACTION_IDS.reduce((sum, id) => sum + (byReaction[id] ?? 0), 0);
}

/** Compact emoji strip for summaries — no reaction names in UI. */
export function kudosReactionEmojiStrip(): string {
  return ACTIVITY_REACTION_IDS.map((id) => ACTIVITY_REACTIONS[id].emoji).join('');
}
