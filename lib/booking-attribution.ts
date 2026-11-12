import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Booking attribution — the fee-neutral evidence layer (business plan, Nov 2026).
 * Records, for every paid participant-booking, the five facts pricing will one
 * day need: who created the session, its visibility, how the family entered
 * (`source`, when the client reports one), how many other families were
 * already in the session (seat incrementality), and whether this coach-family
 * pair had booked before. Also stamps coach_family_relationships at a pair's
 * first booking — the stamp is permanent and never recomputed.
 *
 * Deliberately simple: observable facts only, no algorithmic credit
 * assignment. Changes no fees. Ambiguity is resolved later, by policy, in the
 * coach's favor. Tolerates the columns/table not existing yet (SQL is
 * hand-applied to prod) and must never break a booking: every failure is
 * swallowed after a console.warn.
 */
export type BookingSource =
  | 'share_link' // coach's /join/CODE link
  | 'chat_offer' // offer card in a Guild conversation
  | 'session_request' // coach accepted the family's request
  | 'directory' // coach profile via browse/search
  | 'map' // coach map pin
  | 'browse_open' // public open-sessions list
  | 'alert' // follower/open-spot push notification
  | 'rebook' // booked again from own history
  | 'admin'; // created by an admin on their behalf

export async function recordBookingAttribution(
  admin: SupabaseClient,
  opts: {
    sessionId: string;
    parentId: string;
    source?: BookingSource | string | null;
  }
): Promise<void> {
  try {
    const { data: session } = await admin
      .from('sessions')
      .select('id, athlete_id, join_policy, session_type')
      .eq('id', opts.sessionId)
      .maybeSingle();
    if (!session) return;

    // Other families already in this session (any session, not just this pair)
    const { data: existing } = await admin
      .from('session_participants')
      .select('id, parent_id, created_at')
      .eq('session_id', opts.sessionId);
    const myRow = (existing ?? [])
      .filter((r) => r.parent_id === opts.parentId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
    const occupancy = new Set(
      (existing ?? [])
        .filter(
          (r) =>
            r.parent_id !== opts.parentId &&
            (!myRow || r.created_at <= myRow.created_at)
        )
        .map((r) => r.parent_id)
    ).size;

    // Did this coach-family pair transact before this session?
    const { data: priorSessions } = await admin
      .from('sessions')
      .select('id')
      .eq('athlete_id', session.athlete_id);
    const priorIds = (priorSessions ?? [])
      .map((s) => s.id)
      .filter((id) => id !== opts.sessionId);
    let priorRelationship = false;
    if (priorIds.length) {
      const { count } = await admin
        .from('session_participants')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', opts.parentId)
        .in('session_id', priorIds);
      priorRelationship = (count ?? 0) > 0;
    }

    const source = opts.source ? String(opts.source).slice(0, 40) : null;

    if (myRow) {
      const { error } = await admin
        .from('session_participants')
        .update({
          booking_source: source,
          occupancy_at_booking: occupancy,
          prior_relationship: priorRelationship,
        })
        .eq('id', myRow.id);
      if (error && !/booking_source|occupancy_at_booking|prior_relationship|schema cache/i.test(error.message)) {
        console.warn('booking attribution update:', error.message);
      }
    }

    // Permanent pair stamp at first booking only
    const { error: relError } = await admin.from('coach_family_relationships').insert({
      coach_id: session.athlete_id,
      parent_id: opts.parentId,
      source,
      first_session_id: opts.sessionId,
      occupancy_at_first_booking: occupancy,
    });
    if (
      relError &&
      !/duplicate|unique|coach_family_relationships|schema cache/i.test(relError.message)
    ) {
      console.warn('relationship stamp:', relError.message);
    }
  } catch (e) {
    console.warn('recordBookingAttribution failed (non-fatal):', e);
  }
}
