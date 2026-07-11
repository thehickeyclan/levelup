import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { deleteActivityPhoto } from '@/lib/activity-feed/delete-activity-photo';

/** DELETE — remove one photo from an activity post (and the post if it was the last photo). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await params;
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
    const result = await deleteActivityPhoto(admin, photoId, {
      userId: user.id,
      role,
      coachId: role === 'coach' ? user.id : viewAsCoachId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      postId: result.postId,
      postDeleted: result.postDeleted,
      remainingPhotos: result.remainingPhotos,
    });
  } catch (e) {
    console.error('activity photos DELETE:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
