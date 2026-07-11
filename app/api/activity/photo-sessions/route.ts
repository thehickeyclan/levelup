import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchEligiblePhotoSessions } from '@/lib/activity-feed/photo-post-auth';

/** GET — completed sessions this user can attach activity photos to. */
export async function GET() {
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
  const role = userData?.role ?? 'parent';
  if (!['parent', 'coach', 'youth_wrestler', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const viewAsCoachId =
    role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value?.trim() ?? null : null;

  const admin = createAdminClient(tenant.slug);
  const sessions = await fetchEligiblePhotoSessions(admin, {
    userId: user.id,
    role,
    coachId: role === 'coach' ? user.id : viewAsCoachId,
  });

  return NextResponse.json({ sessions });
}
