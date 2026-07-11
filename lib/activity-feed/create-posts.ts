import type { SupabaseClient } from '@supabase/supabase-js';
import { SESSION_MILESTONE_DEFS } from '@/lib/rewards';

function isDuplicateKeyError(message: string): boolean {
  return message.includes('duplicate') || message.includes('unique');
}

/**
 * Auto-post one session_completed card per wrestler on the roster when a session is marked complete.
 */
export async function createSessionCompletedActivityPosts(
  admin: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { data: session, error: sessionErr } = await admin
    .from('sessions')
    .select('id, athlete_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    if (sessionErr) console.error('activity session_completed lookup:', sessionErr);
    return;
  }

  const { data: participants, error: partErr } = await admin
    .from('session_participants')
    .select('youth_wrestler_id, parent_id')
    .eq('session_id', sessionId);

  if (partErr) {
    console.error('activity session_completed participants:', partErr);
    return;
  }

  const rows = participants ?? [];
  if (rows.length === 0) return;

  const wrestlerIds = [
    ...new Set(
      rows
        .map((p: { youth_wrestler_id?: string | null }) => p.youth_wrestler_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (wrestlerIds.length === 0) {
    const actorParentId =
      (rows[0] as { parent_id?: string | null }).parent_id ?? null;
    const { error } = await admin.from('activity_posts').insert({
      trigger_type: 'session_completed',
      actor_parent_id: actorParentId,
      youth_wrestler_id: null,
      coach_id: session.athlete_id,
      session_id: sessionId,
      is_public: true,
    });
    if (error && !isDuplicateKeyError(error.message)) {
      console.error('activity session_completed drop-in insert:', error);
    }
    return;
  }

  const { data: wrestlers } = await admin
    .from('youth_wrestlers')
    .select('id, parent_id, profile_public')
    .in('id', wrestlerIds);

  const wrestlerById = new Map(
    (wrestlers ?? []).map((yw: { id: string; parent_id: string; profile_public?: boolean | null }) => [
      yw.id,
      yw,
    ])
  );

  for (const row of participants ?? []) {
    const youthWrestlerId = row.youth_wrestler_id as string | null | undefined;
    if (!youthWrestlerId) continue;

    const yw = wrestlerById.get(youthWrestlerId);
    const actorParentId =
      (row.parent_id as string | null | undefined) ?? yw?.parent_id ?? null;
    const isPublic = yw?.profile_public !== false;

    const { error } = await admin.from('activity_posts').insert({
      trigger_type: 'session_completed',
      actor_parent_id: actorParentId,
      youth_wrestler_id: youthWrestlerId,
      coach_id: session.athlete_id,
      session_id: sessionId,
      is_public: isPublic,
    });

    if (error && !isDuplicateKeyError(error.message)) {
      console.error('activity session_completed insert:', error);
    }
  }
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
 * Attach a parent review to the existing session_completed activity card (PRD: no second card).
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

  let query = admin
    .from('activity_posts')
    .update({ review_id: opts.reviewId })
    .eq('session_id', opts.sessionId)
    .eq('trigger_type', 'session_completed');

  if (youthWrestlerId) {
    query = query.eq('youth_wrestler_id', youthWrestlerId);
  } else {
    query = query.eq('actor_parent_id', opts.parentId);
  }

  const { error } = await query;
  if (error) {
    console.error('activity review attach:', error);
  }
}
