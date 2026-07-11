import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import {
  coachMessagingSessionSearchHaystack,
  isCoachHubMessageableSession,
  type CoachMessagingSessionRow,
} from '@/lib/coach-messaging-sessions';

/**
 * GET — coach (or admin view-as): searchable small-group / partner sessions for Messages hub.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'coach' && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cookieStore = await cookies();
    const viewAsCoachId =
      userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
    const coachId = viewAsCoachId || user.id;

    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();

    const admin = createAdminClient(tenant.slug);
    const now = new Date();
    const pastCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureCutoff = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: sessions, error } = await admin
      .from('sessions')
      .select(
        `
        id,
        scheduled_datetime,
        session_type,
        session_mode,
        status,
        current_participants,
        max_participants,
        facilities(name),
        session_participants(
          youth_wrestlers(first_name, last_name)
        )
      `
      )
      .eq('athlete_id', coachId)
      .eq('status', 'scheduled')
      .gte('scheduled_datetime', pastCutoff)
      .lte('scheduled_datetime', futureCutoff)
      .order('scheduled_datetime', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: CoachMessagingSessionRow[] = [];

    for (const s of sessions ?? []) {
      if (
        !isCoachHubMessageableSession({
          session_type: s.session_type,
          session_mode: s.session_mode,
          max_participants: s.max_participants,
          current_participants: s.current_participants,
        })
      ) {
        continue;
      }

      const f = s.facilities as { name?: string } | { name?: string }[] | null;
      const facility = Array.isArray(f) ? f[0] : f;
      const rawParts = s.session_participants;
      const parts = Array.isArray(rawParts) ? rawParts : rawParts ? [rawParts] : [];
      const wrestler_names: string[] = [];
      for (const p of parts) {
        const yw = (p as { youth_wrestlers?: { first_name?: string; last_name?: string } | null })
          .youth_wrestlers;
        const o = Array.isArray(yw) ? yw[0] : yw;
        if (o) {
          const name = [o.first_name, o.last_name].filter(Boolean).join(' ').trim();
          if (name) wrestler_names.push(name);
        }
      }

      const row: CoachMessagingSessionRow = {
        id: s.id as string,
        scheduled_datetime: s.scheduled_datetime as string,
        session_type: (s.session_type as string) ?? null,
        session_mode: (s.session_mode as string) ?? null,
        status: s.status as string,
        current_participants: Number(s.current_participants ?? 0),
        max_participants: Number(s.max_participants ?? 1),
        facility_name: facility?.name ?? '—',
        wrestler_names,
      };

      if (q) {
        const dateLabel = formatEST(new Date(row.scheduled_datetime), 'EEE MMM d h:mm a');
        if (!coachMessagingSessionSearchHaystack(row, dateLabel).includes(q)) continue;
      }

      rows.push(row);
    }

    return NextResponse.json({
      sessions: rows.map((row) => ({
        ...row,
        label: formatEST(new Date(row.scheduled_datetime), 'EEE, MMM d · h:mm a'),
        roster_preview:
          row.wrestler_names.length > 0
            ? row.wrestler_names.slice(0, 4).join(', ') +
              (row.wrestler_names.length > 4 ? ` +${row.wrestler_names.length - 4}` : '')
            : 'No signups yet',
        can_sms: row.current_participants > 0,
      })),
    });
  } catch (e) {
    console.error('coach messaging-sessions GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
