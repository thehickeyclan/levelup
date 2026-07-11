import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchCoachSessionRosterRows } from '@/lib/coach-session-roster-rows';
import { resolveCoachActorId } from '@/lib/coach-actor-server';

/**
 * Session roster for coaches (same shape as admin roster GET).
 * Only the session's coach may read (or admin with preview-as coach).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
    const tenant = getTenantByDomain(host);

    if (!tenant) {
      return NextResponse.json({ roster: [] }, { status: 400 });
    }

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const admin = createAdminClient(tenant.slug);

    const { data: sessionRow, error: sessionErr } = await admin
      .from('sessions')
      .select('id, athlete_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json({ roster: [], error: sessionErr.message }, { status: 500 });
    }
    if (!sessionRow) {
      return NextResponse.json({ roster: [] }, { status: 404 });
    }
    if (sessionRow.athlete_id !== actor.coachId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { roster, error } = await fetchCoachSessionRosterRows(admin, sessionId);
    if (error) {
      return NextResponse.json({ roster: [], error }, { status: 500 });
    }

    return NextResponse.json({
      roster: roster.map((r) => ({
        ...r,
        parentEmail: null,
        createdAt: '',
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ roster: [], error: message }, { status: 500 });
  }
}
