import type { SupabaseClient } from '@supabase/supabase-js';
import { attachFeedPostPhotos } from '@/lib/activity-feed/attach-photo-urls';
import { attachMarketListingFeedMeta } from '@/lib/activity-feed/market-listing-post';
import {
  emptyKudosByReaction,
  normalizeActivityReactionId,
  totalKudosCount,
  type ActivityReactionId,
} from '@/lib/activity-feed/kudos-reactions';
import { attachPhotoPostManageFlags, type PhotoPostActor } from '@/lib/activity-feed/photo-post-auth';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import type { ActivityFeedPost, ActivityFeedScope } from '@/lib/activity-feed/types';

const POST_SELECT = `
  id,
  trigger_type,
  created_at,
  caption,
  actor_parent_id,
  youth_wrestler_id,
  coach_id,
  session_id,
  milestone_id,
  review_id,
  market_listing_id,
  youth_wrestlers(id, first_name, last_name, photo_url, school),
  athletes(id, first_name, last_name, photo_url),
  sessions(id, session_type, session_mode, scheduled_datetime, duration_minutes, join_policy, partner_invite_code, facilities(name)),
  reward_milestones(id, milestone),
  reviews(id, rating, comment),
  market_listings(id, brand, model, title, colorway, listing_type)
`;

type FetchOpts = {
  scope: ActivityFeedScope;
  limit?: number;
  cursor?: string | null;
  coachId?: string | null;
  youthWrestlerIds?: string[];
  photoActor?: PhotoPostActor | null;
  tenantSlug?: string;
};

async function attachKudos(
  db: SupabaseClient,
  posts: Omit<ActivityFeedPost, 'kudos_count' | 'kudos_by_reaction' | 'viewer_reactions'>[],
  viewerId: string
): Promise<ActivityFeedPost[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const { data: kudosRows } = await db
    .from('activity_kudos')
    .select('post_id, user_id, reaction')
    .in('post_id', postIds);

  const byPostReaction = new Map<string, ReturnType<typeof emptyKudosByReaction>>();
  const viewerReactionsByPost = new Map<string, ActivityReactionId[]>();

  for (const row of kudosRows ?? []) {
    const pid = row.post_id as string;
    const reaction = normalizeActivityReactionId(row.reaction);
    const counts = byPostReaction.get(pid) ?? emptyKudosByReaction();
    counts[reaction] += 1;
    byPostReaction.set(pid, counts);

    if (row.user_id === viewerId) {
      const viewer = viewerReactionsByPost.get(pid) ?? [];
      viewer.push(reaction);
      viewerReactionsByPost.set(pid, viewer);
    }
  }

  return posts.map((p) => {
    const kudos_by_reaction = byPostReaction.get(p.id) ?? emptyKudosByReaction();
    return {
      ...p,
      kudos_by_reaction,
      kudos_count: totalKudosCount(kudos_by_reaction),
      viewer_reactions: viewerReactionsByPost.get(p.id) ?? [],
    };
  });
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
    if (ids.length === 0) {
      query = query.eq('actor_parent_id', viewerId);
    } else {
      const idList = ids.map((id) => `"${id}"`).join(',');
      query = query.or(`youth_wrestler_id.in.(${idList}),actor_parent_id.eq.${viewerId}`);
    }
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

  const rows = (data ?? []) as Omit<
    ActivityFeedPost,
    'kudos_count' | 'kudos_by_reaction' | 'viewer_reactions'
  >[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.created_at ?? null : null;
  const posts = await attachKudos(db, page, viewerId);
  const withPhotos = await attachFeedPostPhotos(db, posts);
  const withSellerMeta = opts.tenantSlug
    ? await attachMarketListingFeedMeta(opts.tenantSlug, withPhotos)
    : withPhotos;
  if (opts.photoActor) {
    const withManage = await attachPhotoPostManageFlags(db, withSellerMeta, opts.photoActor);
    return { posts: withManage, nextCursor };
  }

  return { posts: withSellerMeta, nextCursor };
}

export async function fetchFamilyActivityPosts(
  db: SupabaseClient,
  viewerId: string,
  youthWrestlerIds: string[],
  limit = 5,
  photoActor?: PhotoPostActor | null
): Promise<ActivityFeedPost[]> {
  const { posts } = await fetchActivityFeed(db, viewerId, {
    scope: 'family',
    youthWrestlerIds,
    limit,
    photoActor,
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
