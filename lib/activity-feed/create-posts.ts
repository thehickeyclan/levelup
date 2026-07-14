import type { SupabaseClient } from '@supabase/supabase-js';
import { SESSION_MILESTONE_DEFS } from '@/lib/rewards';

function isDuplicateKeyError(message: string): boolean {
  return message.includes('duplicate') || message.includes('unique');
}

/**
 * Auto-post when a parent earns a session-count milestone (sessions_5, sessions_10, sessions_25).
 */
export async function createMilestoneHitActivityPost(
  admin: SupabaseClient,
  opts: { parentId: string; milestoneId: string; milestoneKey: string }
): Promise<void> {
  if (!SESSION_MILESTONE_DEFS.some((m) => m.key === opts.milestoneKey)) return;

  const { data: wrestler } = await admin
    .from('youth_wrestlers')
    .select('id, profile_public')
    .eq('parent_id', opts.parentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from('activity_posts').insert({
    trigger_type: 'milestone_hit',
    actor_parent_id: opts.parentId,
    youth_wrestler_id: wrestler?.id ?? null,
    milestone_id: opts.milestoneId,
    is_public: wrestler?.profile_public !== false,
  });

  if (error && !isDuplicateKeyError(error.message)) {
    console.error('activity milestone_hit insert:', error);
  }
}

async function resolveYouthWrestlerIdForParentOnSession(
  admin: SupabaseClient,
  sessionId: string,
  parentId: string
): Promise<string | null> {
  const { data: direct } = await admin
    .from('session_participants')
    .select('youth_wrestler_id')
    .eq('session_id', sessionId)
    .eq('parent_id', parentId)
    .not('youth_wrestler_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (direct?.youth_wrestler_id) return direct.youth_wrestler_id as string;

  const { data: parts } = await admin
    .from('session_participants')
    .select('youth_wrestler_id')
    .eq('session_id', sessionId)
    .not('youth_wrestler_id', 'is', null);

  const youthIds = (parts ?? [])
    .map((p: { youth_wrestler_id?: string | null }) => p.youth_wrestler_id)
    .filter((id): id is string => Boolean(id));

  if (youthIds.length === 0) return null;

  const { data: linked } = await admin
    .from('youth_wrestler_parents')
    .select('youth_wrestler_id')
    .in('youth_wrestler_id', youthIds)
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();

  return (linked?.youth_wrestler_id as string | undefined) ?? null;
}

/**
 * Attach a parent review to the booking activity card (no second card).
 * Falls back to legacy session_completed posts if present.
 */
export async function attachReviewToSessionCompletedActivityPost(
  admin: SupabaseClient,
  opts: { sessionId: string; parentId: string; reviewId: string }
): Promise<void> {
  const youthWrestlerId = await resolveYouthWrestlerIdForParentOnSession(
    admin,
    opts.sessionId,
    opts.parentId
  );

  for (const triggerType of ['booking_confirmed', 'session_completed'] as const) {
    let query = admin
      .from('activity_posts')
      .update({ review_id: opts.reviewId })
      .eq('session_id', opts.sessionId)
      .eq('trigger_type', triggerType);

    if (youthWrestlerId) {
      query = query.eq('youth_wrestler_id', youthWrestlerId);
    } else {
      query = query.eq('actor_parent_id', opts.parentId);
    }

    const { data, error } = await query.select('id');
    if (error) {
      console.error('activity review attach:', error);
      return;
    }
    if (data && data.length > 0) return;
  }
}
