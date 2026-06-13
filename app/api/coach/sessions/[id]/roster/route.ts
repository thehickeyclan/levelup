import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

/**
 * Session roster for coaches (same shape as admin roster GET).
 * Only the session's coach may read (or admin with view-as coach).
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

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'coach' && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cookieStore = await cookies();
    const viewAsCoachId =
      userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
    const effectiveCoachId = viewAsCoachId || user.id;

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
    if (sessionRow.athlete_id !== effectiveCoachId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: sessionData, error } = await admin
      .from('sessions')
      .select('id, session_participants(id, amount_paid, paid, youth_wrestler_id)')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ roster: [], error: error.message }, { status: 500 });
    }

    if (!sessionData) {
      return NextResponse.json({ roster: [] });
    }

    const raw = sessionData.session_participants;
    const participants = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const youthIds = participants
      .map((p: Record<string, unknown>) => p.youth_wrestler_id as string)
      .filter(Boolean);

    const wrestlerNames: Record<string, { first_name: string; last_name: string; photo_url: string | null }> =
      {};
    if (youthIds.length > 0) {
      const { data: wrestlers } = await admin
        .from('youth_wrestlers')
        .select('id, first_name, last_name, photo_url')
        .in('id', youthIds);

      if (wrestlers) {
        for (const w of wrestlers) {
          wrestlerNames[w.id] = {
            first_name: w.first_name,
            last_name: w.last_name,
            photo_url: w.photo_url,
          };
        }
      }
    }

    const roster = participants.map((p: Record<string, unknown>) => {
      const youthId = p.youth_wrestler_id as string | null;
      const wrestler = youthId ? wrestlerNames[youthId] : null;
      const name = wrestler ? `${wrestler.first_name} ${wrestler.last_name}`.trim() : 'Drop-in';
      return {
        id: p.id as string,
        wrestlerId: youthId,
        wrestlerName: name,
        photoUrl: wrestler?.photo_url || null,
        parentEmail: null,
        /** List price / expected amount may be set before Stripe settles; only `paid` means money collected. */
        paid: p.paid === true,
        amountPaid: Number(p.amount_paid ?? 0),
        isDropIn: youthId === null,
        createdAt: '',
      };
    });

    return NextResponse.json({ roster });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ roster: [], error: message }, { status: 500 });
  }
}
