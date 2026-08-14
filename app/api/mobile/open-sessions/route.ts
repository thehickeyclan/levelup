import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

/**
 * Public browse: upcoming joinable small groups. Guests see the same list as
 * members (RLS hides sessions from the anon client, so this reads via admin);
 * joining/booking stays behind auth.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const admin = createAdminClient(tenant.slug);
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('sessions')
      .select(
        `
        id,
        athlete_id,
        scheduled_datetime,
        focus_area,
        current_participants,
        max_participants,
        price_per_participant,
        total_price,
        athletes(id, first_name, last_name, school, photo_url),
        facilities(name, address)
      `
      )
      .in('session_type', ['group', 'small_group'])
      .eq('status', 'scheduled')
      .in('join_policy', ['public', 'invite_only'])
      .gte('scheduled_datetime', now)
      .order('scheduled_datetime', { ascending: true })
      .limit(40);

    if (error) {
      console.error('mobile open-sessions GET:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data ?? [] });
  } catch (e) {
    console.error('mobile open-sessions GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
