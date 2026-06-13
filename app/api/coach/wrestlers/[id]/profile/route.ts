import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchCoachWrestlerProfile } from '@/lib/coach-wrestler-profile';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: youthWrestlerId } = await params;
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
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

    const admin = createAdminClient(tenant.slug);
    const profile = await fetchCoachWrestlerProfile(admin, coachId, youthWrestlerId);
    if (!profile) {
      return NextResponse.json({ error: 'Wrestler not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (e) {
    console.error('coach wrestler profile GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
