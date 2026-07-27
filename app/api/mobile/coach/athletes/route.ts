import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { resolveCoachActorId } from '@/lib/coach-actor-server';
import { fetchMobileCoachAthletes } from '@/lib/mobile-coach-athletes';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Native coach directory: every athlete registered for this coach, plus Guild history. */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const athleteId = request.nextUrl.searchParams.get('athleteId')?.trim() || null;
    const admin = createAdminClient(tenant.slug);
    const athletes = await fetchMobileCoachAthletes(admin, actor.coachId, athleteId);

    return NextResponse.json({
      coachId: actor.coachId,
      athletes,
      count: athletes.length,
    });
  } catch (error) {
    console.error('mobile coach athletes:', error);
    return NextResponse.json({ error: 'Could not load coach athletes' }, { status: 500 });
  }
}
