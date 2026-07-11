import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { createSessionCompletedActivityPosts } from '@/lib/activity-feed/create-posts';
import { checkSessionMilestonesForParent, isRewardsProgramEnabled } from '@/lib/rewards';
import { notifyAdminsSessionCompleted } from '@/lib/twilio';

/**
 * POST - Mark a session as completed.
 * Allowed for admin or the session's coach (athlete_id).
 * Only allowed when status is scheduled.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const isAdmin = userData?.role === 'admin';
    const isCoach = userData?.role === 'coach';

    if (!isAdmin && !isCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: session, error: fetchError } = await admin
      .from('sessions')
      .select('id, status, athlete_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const isSessionCoach = session.athlete_id === user.id;
    if (!isAdmin && !isSessionCoach) {
      return NextResponse.json({ error: 'Not authorized to complete this session' }, { status: 403 });
    }

    if (session.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Session can only be marked complete when it is open (scheduled)' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('sessions')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Mark session complete error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await createSessionCompletedActivityPosts(admin, sessionId);

    void notifyAdminsSessionCompleted(admin, {
      sessionId,
      coachUserId: session.athlete_id,
      completedByUserId: user.id,
    }).catch((e) => console.error('Admin session completed SMS:', e));

    if (isRewardsProgramEnabled()) {
      const { data: partRows } = await admin
        .from('session_participants')
        .select('parent_id')
        .eq('session_id', sessionId)
        .eq('paid', true);
      const parentIds = [
        ...new Set(
          (partRows ?? [])
            .map((r: { parent_id?: string | null }) => r.parent_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      for (const parentId of parentIds) {
        await checkSessionMilestonesForParent(admin, { tenantSlug: tenant.slug, parentId });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Mark session complete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
