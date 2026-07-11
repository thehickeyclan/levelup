import { SESSION_MILESTONE_DEFS } from '@/lib/rewards';

/** Human-readable label for a reward_milestones.milestone key. */
export function milestoneLabelForKey(key: string): string {
  const def = SESSION_MILESTONE_DEFS.find((m) => m.key === key);
  if (def) return def.label;
  if (key.startsWith('review:')) return 'Left a review';
  return key.replace(/_/g, ' ');
}
