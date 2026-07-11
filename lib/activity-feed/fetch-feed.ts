import type { SupabaseClient } from '@supabase/supabase-js';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import type { ActivityFeedPost, ActivityFeedScope } from '@/lib/activity-feed/types';

const POST_SELECT = `
  id,
  trigger_type,
  created_at,
  caption,
  youth_wrestler_id,
  coach_id,
  session_id,
  milestone_id,
  youth_wrestlers(id, first_name, last_name, photo_url, school),
  athletes(id, first_name, last_name, photo_url),
  sessions(id, session_type, session_mode, scheduled_datetime, duration_minutes, facilities(name)),
  reward_milestones(id, milestone)
`;

type FetchOpts = {
  scope: ActivityFeedScope;
  limit?: number;
  cursor?: string | null;
  coachId?: string | null;
  youthWrestlerIds?: string[];
};

async function attachKudos(
  db: SupabaseClient,
  posts: Omit<ActivityFeedPost, 'kudos_count' | 'viewer_has_kudos'>[],
  viewerId: string
): Promise<ActivityFeedPost[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const { data: kudosRows } = await db
    .from('activity_kudos')
    .select('post_id, user_id')
    .in('post_id', postIds);

  const countByPost = new Map<string, number>();
  const viewerKudos = new Set<string>();
  for (const row of kudosRows ?? []) {
    const pid = row.post_id as string;
    countByPost.set(pid, (countByPost.get(pid) ?? 0) + 1);
    if (row.user_id === viewerId) viewerKudos.add(pid);
  }

  return posts.map((p) => ({
    ...p,
    kudos_count: countByPost.get(p.id) ?? 0,
    viewer_has_kudos: viewerKudos.has(p.id),
  }));
}

export async function fetchActivityFeed(
  db: SupabaseClient,
  viewerId: string,
  opts: FetchOpts
): Promise<{ posts: ActivityFeedPost[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

  let query = db
    .from('activity_posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (opts.cursor) {
    query = query.lt('created_at', opts.cursor);
  }

  if (opts.scope === 'community') {
    query = query.eq('is_public', true);
  } else if (opts.scope === 'family') {
    const ids = opts.youthWrestlerIds ?? [];
    if (ids.length === 0) return { posts: [], nextCursor: null };
    query = query.in('youth_wrestler_id', ids);
  } else if (opts.scope === 'coach') {
    const coachId = opts.coachId?.trim();
    if (!coachId) return { posts: [], nextCursor: null };
    query = query.eq('coach_id', coachId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchActivityFeed:', error);
    return { posts: [], nextCursor: null };
  }

  const rows = (data ?? []) as Omit<ActivityFeedPost, 'kudos_count' | 'viewer_has_kudos'>[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.created_at ?? null : null;
  const posts = await attachKudos(db, page, viewerId);

  return { posts, nextCursor };
}

export async function fetchFamilyActivityPosts(
  db: SupabaseClient,
  viewerId: string,
  youthWrestlerIds: string[],
  limit = 5
): Promise<ActivityFeedPost[]> {
  const { posts } = await fetchActivityFeed(db, viewerId, {
    scope: 'family',
    youthWrestlerIds,
    limit,
  });
  return posts;
}

export async function resolveFeedContext(
  db: SupabaseClient,
  viewerId: string,
  role: string
): Promise<{ youthWrestlerIds: string[]; coachId: string | null }> {
  if (role === 'coach') {
    return { youthWrestlerIds: [], coachId: viewerId };
  }
  if (role === 'youth_wrestler') {
    return { youthWrestlerIds: [viewerId], coachId: null };
  }
  const youthWrestlerIds = await getParentYouthWrestlerIds(db, viewerId);
  return { youthWrestlerIds, coachId: null };
}
