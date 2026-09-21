import type { SupabaseClient } from '@supabase/supabase-js';
import { notifySessionScheduledFollowers } from '@/lib/notify-session-scheduled-followers';

/**
 * Chat session offers created as "private offer" stay invite-only just long
 * enough for the family they were made to. Once that first booking lands and
 * spots remain (partner / group), the leftovers are inventory: flip the
 * session public and alert the coach's followers.
 *
 * Requires sessions.open_spots_after_first_booking (see migration in repo
 * history); until that column exists this is a silent no-op, so booking paths
 * can call it unconditionally.
 */
export async function maybeOpenRemainingSpots(
  admin: SupabaseClient,
  tenantSlug: string,
  sessionId: string
): Promise<void> {
  try {
    const { data: session, error } = await admin
      .from('sessions')
      .select(
        'id, athlete_id, join_policy, status, current_participants, max_participants, scheduled_datetime, partner_invite_code, open_spots_after_first_booking'
      )
      .eq('id', sessionId)
      .maybeSingle();
    if (error || !session) return;
    if (!session.open_spots_after_first_booking) return;
    if (session.status !== 'scheduled' || session.join_policy !== 'invite_only') return;

    const current = Number(session.current_participants ?? 0);
    const max = Number(session.max_participants ?? 0);
    if (current < 1 || current >= max) return;

    const { error: updateError } = await admin
      .from('sessions')
      .update({
        join_policy: 'public',
        open_spots_after_first_booking: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
      .eq('join_policy', 'invite_only');
    if (updateError) return;

    await notifySessionScheduledFollowers(tenantSlug, session.athlete_id as string, {
      sessionId: session.id as string,
      scheduledDatetime: session.scheduled_datetime as string,
      joinUrlPath: `/join/${session.partner_invite_code}`,
    });
  } catch (e) {
    console.warn('maybeOpenRemainingSpots failed (non-fatal):', e);
  }
}
