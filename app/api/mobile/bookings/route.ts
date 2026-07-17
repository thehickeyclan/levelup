import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

/** Parent app: family bookings list. */
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

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = userData?.role ?? '';
    if (role === 'coach') {
      return NextResponse.json({ error: 'Coach accounts use the coach dashboard' }, { status: 403 });
    }

    let youthWrestlerIds: string[] = [];
    if (role === 'youth_wrestler') {
      youthWrestlerIds = [user.id];
    } else {
      youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);
    }

    let familySessionIds: string[] = [];
    if (youthWrestlerIds.length > 0) {
      const { data: partRows } = await supabase
        .from('session_participants')
        .select('session_id')
        .in('youth_wrestler_id', youthWrestlerIds);
      familySessionIds = [
        ...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id)),
      ];
    }

    if (familySessionIds.length === 0) {
      return NextResponse.json({ bookings: [] });
    }

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(
        `
        id,
        athlete_id,
        scheduled_datetime,
        status,
        total_price,
        session_type,
        session_mode,
        focus_area,
        athletes(id, first_name, last_name, school, photo_url),
        facilities(id, name, address)
      `
      )
      .in('id', familySessionIds)
      .order('scheduled_datetime', { ascending: false })
      .limit(50);

    if (error) {
      console.error('mobile bookings GET:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bookings = (sessions ?? []).map((s) => {
      const athletes = s.athletes as
        | { id: string; first_name: string; last_name: string; school: string; photo_url: string | null }
        | { id: string; first_name: string; last_name: string; school: string; photo_url: string | null }[]
        | null;
      const coach = Array.isArray(athletes) ? athletes[0] : athletes;
      const facilities = s.facilities as
        | { id: string; name: string; address: string | null }
        | { id: string; name: string; address: string | null }[]
        | null;
      const facility = Array.isArray(facilities) ? facilities[0] : facilities;
      return {
        id: s.id,
        athlete_id: s.athlete_id,
        scheduled_datetime: s.scheduled_datetime,
        status: s.status,
        total_price: s.total_price,
        session_type: s.session_type,
        session_mode: s.session_mode,
        focus_area: s.focus_area,
        coach: coach
          ? {
              id: coach.id,
              first_name: coach.first_name,
              last_name: coach.last_name,
              school: coach.school,
              photo_url: coach.photo_url,
            }
          : null,
        facility: facility
          ? { id: facility.id, name: facility.name, address: facility.address }
          : null,
      };
    });

    return NextResponse.json({ bookings });
  } catch (e) {
    console.error('mobile bookings:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
