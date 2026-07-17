import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

type HistoryRow = {
  youth_wrestler_id: string;
  sessions:
    | { id: string; athlete_id: string; status: string; scheduled_datetime: string }
    | { id: string; athlete_id: string; status: string; scheduled_datetime: string }[]
    | null;
};

type CompletedRow = {
  id: string;
  athlete_id?: string | null;
  scheduled_datetime: string;
  session_type?: string | null;
  athletes?:
    | { first_name?: string; last_name?: string }
    | { first_name?: string; last_name?: string }[]
    | null;
  session_participants?: Array<{
    youth_wrestler_id?: string | null;
    youth_wrestlers?:
      | { id?: string; first_name?: string; last_name?: string }
      | { id?: string; first_name?: string; last_name?: string }[]
      | null;
  }>;
};

/**
 * Parent app: review prompts for home — first completed session per coach,
 * minus reviewed and dismissed. Mirrors the web parent dashboard.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);
    if (youthWrestlerIds.length === 0) return NextResponse.json({ prompts: [] });
    const youthWrestlerIdSet = new Set(youthWrestlerIds);

    const { data: partRows } = await supabase
      .from('session_participants')
      .select('session_id')
      .in('youth_wrestler_id', youthWrestlerIds);
    const familySessionIds = [
      ...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id)),
    ];
    if (familySessionIds.length === 0) return NextResponse.json({ prompts: [] });

    const [{ data: reviewIdRows }, { data: dismissedReviewRows }, { data: historyRows }] =
      await Promise.all([
        supabase.from('reviews').select('session_id, athlete_id').eq('parent_id', user.id),
        supabase.from('review_prompt_dismissals').select('athlete_id').eq('parent_id', user.id),
        supabase
          .from('session_participants')
          .select('youth_wrestler_id, sessions!inner(id, athlete_id, status, scheduled_datetime)')
          .in('youth_wrestler_id', youthWrestlerIds)
          .eq('sessions.status', 'completed'),
      ]);

    const reviewedSessionIds = new Set(
      (reviewIdRows ?? []).map((r: { session_id: string }) => r.session_id).filter(Boolean)
    );
    const reviewedCoachIds = new Set(
      (reviewIdRows ?? [])
        .map((r: { athlete_id?: string | null }) => r.athlete_id)
        .filter((id): id is string => Boolean(id))
    );
    const dismissedReviewCoachIds = new Set(
      (dismissedReviewRows ?? [])
        .map((r: { athlete_id?: string | null }) => r.athlete_id)
        .filter((id): id is string => Boolean(id))
    );

    // Earliest completed session per (youth wrestler, coach) — prompt only for that first session.
    const earliestCompletedByYouthCoach = new Map<
      string,
      { id: string; scheduled_datetime: string }
    >();
    for (const row of (historyRows ?? []) as HistoryRow[]) {
      const sessRaw = row.sessions;
      const sess = Array.isArray(sessRaw) ? sessRaw[0] : sessRaw;
      if (!sess?.athlete_id || !sess.id) continue;
      const key = `${row.youth_wrestler_id}:${sess.athlete_id}`;
      const next = { id: sess.id, scheduled_datetime: sess.scheduled_datetime };
      const prev = earliestCompletedByYouthCoach.get(key);
      if (
        !prev ||
        next.scheduled_datetime < prev.scheduled_datetime ||
        (next.scheduled_datetime === prev.scheduled_datetime && next.id < prev.id)
      ) {
        earliestCompletedByYouthCoach.set(key, next);
      }
    }

    const { data: completedSessions } = await supabase
      .from('sessions')
      .select(
        `
        id,
        athlete_id,
        scheduled_datetime,
        session_type,
        athletes:athlete_id(first_name, last_name),
        session_participants(youth_wrestler_id, youth_wrestlers(id, first_name, last_name))
      `
      )
      .in('id', familySessionIds)
      .eq('status', 'completed')
      .order('scheduled_datetime', { ascending: false })
      .limit(200);

    const prompts = [];
    for (const raw of (completedSessions ?? []) as CompletedRow[]) {
      if (reviewedSessionIds.has(raw.id)) continue;
      const attendingAthletes: { id: string; first_name?: string; last_name?: string }[] = [];
      for (const p of raw.session_participants ?? []) {
        const ywRaw = p.youth_wrestlers;
        const yw = Array.isArray(ywRaw) ? ywRaw[0] : ywRaw;
        const yid = p.youth_wrestler_id || yw?.id;
        if (!yid || !youthWrestlerIdSet.has(yid)) continue;
        attendingAthletes.push({ id: yid, first_name: yw?.first_name, last_name: yw?.last_name });
      }
      if (attendingAthletes.length === 0) continue;
      const coachId = raw.athlete_id ?? '';
      if (!coachId) continue;
      if (reviewedCoachIds.has(coachId) || dismissedReviewCoachIds.has(coachId)) continue;
      const isFirstForSomeAthlete = attendingAthletes.some(
        (a) => earliestCompletedByYouthCoach.get(`${a.id}:${coachId}`)?.id === raw.id
      );
      if (!isFirstForSomeAthlete) continue;

      const coachRaw = raw.athletes;
      const coach = Array.isArray(coachRaw) ? coachRaw[0] : coachRaw;
      prompts.push({
        sessionId: raw.id,
        scheduled_datetime: raw.scheduled_datetime,
        session_type: raw.session_type ?? null,
        coachId,
        coachName: [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim() || 'Coach',
        attendingAthletes,
      });
    }

    return NextResponse.json({ prompts });
  } catch (e) {
    console.error('mobile pending reviews:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
