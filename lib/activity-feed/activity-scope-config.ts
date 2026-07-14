import type { ActivityFeedScope } from '@/lib/activity-feed/types';

export type ActivityScopeOption = {
  scope: ActivityFeedScope;
  label: string;
  description: string;
  emptyMessage: string;
};

const COMMUNITY: ActivityScopeOption = {
  scope: 'community',
  label: 'All Guild',
  description: 'Sessions booked, photos shared, collection pairs, and milestones across Guild.',
  emptyMessage:
    'No activity yet. When sessions are booked, photos are shared, or collection pairs go live — they show up here.',
};

function familyScope(label: string, description: string): ActivityScopeOption {
  return {
    scope: 'family',
    label,
    description,
    emptyMessage:
      'No activity yet for your wrestlers. Booked sessions, milestones, photos, and reviews show up here.',
  };
}

const COACH_SCOPE: ActivityScopeOption = {
  scope: 'coach',
  label: 'My Sessions',
  description: 'Activity on your sessions — bookings, photos, milestones, and reviews.',
  emptyMessage:
    'No activity on your sessions yet. When wrestlers book sessions or share photos, they show up here.',
};

/** Personal feed scope + copy for the signed-in role. */
export function personalActivityScopeOption(
  role: string,
  opts?: { adminPreviewingCoach?: boolean }
): ActivityScopeOption | null {
  if (role === 'coach' || (role === 'admin' && opts?.adminPreviewingCoach)) {
    return COACH_SCOPE;
  }
  if (role === 'parent' || role === 'admin') {
    return familyScope('My Family', 'Bookings, milestones, photos, and reviews from your wrestlers.');
  }
  if (role === 'youth_wrestler') {
    return familyScope('My Training', 'Your booked sessions, milestones, photos, and reviews.');
  }
  return null;
}

export function activityScopeOptions(
  role: string,
  opts?: { adminPreviewingCoach?: boolean }
): ActivityScopeOption[] {
  const personal = personalActivityScopeOption(role, opts);
  return personal ? [COMMUNITY, personal] : [COMMUNITY];
}

/** Keep URL scope valid for the viewer — unknown or wrong role scopes fall back to community. */
export function normalizeActivityScope(
  scopeParam: string | undefined,
  role: string,
  opts?: { adminPreviewingCoach?: boolean }
): ActivityFeedScope {
  const allowed = new Set(activityScopeOptions(role, opts).map((o) => o.scope));
  const requested = (scopeParam ?? 'community') as ActivityFeedScope;
  return allowed.has(requested) ? requested : 'community';
}

export function activityScopeMeta(
  scope: ActivityFeedScope,
  role: string,
  opts?: { adminPreviewingCoach?: boolean }
): ActivityScopeOption {
  const options = activityScopeOptions(role, opts);
  return options.find((o) => o.scope === scope) ?? COMMUNITY;
}
