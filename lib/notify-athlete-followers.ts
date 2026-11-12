import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { formatEST } from '@/lib/format-date';

/**
 * Tell an athlete's followers they just joined a session, so training buddies
 * can grab the remaining spots. (Rebuilt 2026-11-12: the original was an
 * untracked file lost to a git clean; tables athlete_follows and
 * athlete_follow_alert_log live only in prod — see levelup-migrations-drift.)
 *
 * Deliberately conservative — every gate protects a minor's schedule:
 * - only when the family opted in (youth_wrestlers.share_training_activity)
 * - only public, still-open sessions (never invite-only or full ones)
 * - deduped per follower+session via athlete_follow_alert_log
 * - never notifies the wrestler's own parent (they made the booking)
 * Callers treat this as fire-and-forget; it must never throw.
 */
export async function notifyAthleteFollowersJoinedSession(
  admin: SupabaseClient,
  youthWrestlerId: string,
  sessionId: string
): Promise<void> {
  try {
    const { data: wrestler } = await admin
      .from('youth_wrestlers')
      .select('id, first_name, parent_id, share_training_activity')
      .eq('id', youthWrestlerId)
      .maybeSingle();
    if (!wrestler || wrestler.share_training_activity !== true) return;

    const { data: session } = await admin
      .from('sessions')
      .select(
        'id, status, join_policy, scheduled_datetime, session_type, current_participants, max_participants, athlete_id'
      )
      .eq('id', sessionId)
      .maybeSingle();
    if (!session || session.status !== 'scheduled' || session.join_policy !== 'public') return;
    const spotsLeft =
      Number(session.max_participants ?? 0) - Number(session.current_participants ?? 0);
    if (spotsLeft <= 0) return;

    const { data: follows } = await admin
      .from('athlete_follows')
      .select('follower_user_id')
      .eq('followed_athlete_id', youthWrestlerId);
    const followerIds = [
      ...new Set(
        (follows ?? [])
          .map((f) => f.follower_user_id as string)
          .filter((id) => id && id !== wrestler.parent_id)
      ),
    ];
    if (!followerIds.length) return;

    const { data: alreadySent } = await admin
      .from('athlete_follow_alert_log')
      .select('follower_user_id')
      .eq('followed_athlete_id', youthWrestlerId)
      .eq('session_id', sessionId)
      .in('follower_user_id', followerIds);
    const sentSet = new Set((alreadySent ?? []).map((r) => r.follower_user_id as string));

    const { data: coach } = await admin
      .from('athletes')
      .select('first_name, last_name')
      .eq('id', session.athlete_id)
      .maybeSingle();
    const coachName = [coach?.first_name, coach?.last_name].filter(Boolean).join(' ') || 'a Guild coach';
    const when = session.scheduled_datetime
      ? formatEST(new Date(session.scheduled_datetime as string), 'EEE MMM d, h:mm a')
      : 'an upcoming session';

    for (const followerId of followerIds) {
      if (sentSet.has(followerId)) continue;
      const { error: logError } = await admin.from('athlete_follow_alert_log').insert({
        follower_user_id: followerId,
        followed_athlete_id: youthWrestlerId,
        session_id: sessionId,
      });
      if (logError) continue; // duplicate or race — someone else alerted them
      await createNotification(admin, {
        user_id: followerId,
        type: 'athlete_follow_session',
        title: `${wrestler.first_name ?? 'A wrestler'} is in!`,
        body: `${wrestler.first_name ?? 'A wrestler you follow'} joined Coach ${coachName}'s session ${when} — ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left.`,
        data: { session_id: sessionId, link: `/sessions/${sessionId}` },
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('notifyAthleteFollowersJoinedSession failed (non-fatal):', e);
  }
}
