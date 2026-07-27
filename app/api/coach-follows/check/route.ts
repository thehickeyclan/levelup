import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { resolveCoachActorId } from '@/lib/coach-actor-server';

export async function GET(req: NextRequest) {
  try {
    const host = (await headers()).get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    if (!coachId) return NextResponse.json({ error: 'Missing coachId' }, { status: 400 });
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!['parent', 'youth_wrestler', 'coach', 'admin'].includes(userData?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    let followerId = user.id;
    if (userData?.role === 'admin') {
      const actor = await resolveCoachActorId(supabase, user.id);
      if (actor.ok) followerId = actor.coachId;
    }
    const db = createAdminClient(tenant.slug);

    const { data, error } = await db
      .from('coach_follows')
      .select('id')
      .eq('parent_id', followerId)
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ following: !!data });
  } catch (e) {
    console.error('Coach follows check error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
