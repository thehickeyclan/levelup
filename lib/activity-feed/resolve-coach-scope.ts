import type { ActivityFeedScope } from '@/lib/activity-feed/types';

/** Coach id for `scope=coach` — honors admin "preview as coach" like Schedule does. */
export function resolveCoachScopeForFeed(opts: {
  role: string;
  userId: string;
  scope: ActivityFeedScope;
  viewAsCoachId?: string | null;
}): { coachId: string | null; useAdminClient: boolean } {
  if (opts.scope !== 'coach') {
    return { coachId: null, useAdminClient: false };
  }
  if (opts.role === 'coach') {
    return { coachId: opts.userId, useAdminClient: false };
  }
  const viewAs = opts.viewAsCoachId?.trim();
  if (opts.role === 'admin' && viewAs) {
    return { coachId: viewAs, useAdminClient: true };
  }
  return { coachId: null, useAdminClient: false };
}
