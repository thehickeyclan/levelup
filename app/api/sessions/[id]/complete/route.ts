import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { checkSessionMilestonesForParent, isRewardsProgramEnabled } from '@/lib/rewards';
import { notifyAdminsSessionCompleted } from '@/lib/twilio';

/**
 * POST - Mark a session as completed.
 * Allowed for admin or the session's coach (athlete_id).
 * Only allowed when status is scheduled.
 */
export async function POST(
  req: NextRequest,
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

    const body = (await req.json().catch(() => ({}))) as {
      attendance?: Array<{
        participantId?: string;
        status?: 'attended' | 'no_show';
      }>;
    };
    const attendance = body.attendance;
    const now = new Date().toISOString();

    if (attendance) {
      const { data: participantRows, error: participantsError } = await admin
        .from('session_participants')
        .select('id, status')
        .eq('session_id', sessionId);
      if (participantsError) {
        return NextResponse.json({ error: participantsError.message }, { status: 500 });
      }

      const participantIds = new Set(
        (participantRows ?? [])
          .filter((row: { status?: string | null }) => row.status !== 'cancelled')
          .map((row: { id: string }) => row.id)
      );
      const submittedIds = new Set(attendance.map((item) => item.participantId));
      const valid =
        attendance.length === participantIds.size &&
        submittedIds.size === participantIds.size &&
        attendance.every(
          (item) =>
            Boolean(item.participantId) &&
            participantIds.has(item.participantId as string) &&
            (item.status === 'attended' || item.status === 'no_show')
        );
      if (!valid) {
        return NextResponse.json(
          { error: 'Record attended or no-show for every athlete before closing the session.' },
          { status: 400 }
        );
      }

      for (const item of attendance) {
        const { error: attendanceError } = await admin
          .from('session_participants')
          .update({
            attendance_status: item.status,
            attendance_recorded_at: now,
            attendance_recorded_by: user.id,
          })
          .eq('session_id', sessionId)
          .eq('id', item.participantId as string);
        if (attendanceError) {
          console.error('Record session attendance error:', attendanceError);
          const migrationHint = /attendance_status|schema cache/i.test(attendanceError.message)
            ? ' Run the session attendance database migration, then try again.'
            : '';
          return NextResponse.json(
            { error: `Could not record attendance.${migrationHint}` },
            { status: 500 }
          );
        }
      }
    }

    const { error: updateError } = await admin
      .from('sessions')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Mark session complete error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    void notifyAdminsSessionCompleted(admin, {
      sessionId,
      coachUserId: session.athlete_id,
      completedByUserId: user.id,
    }).catch((e) => console.error('Admin session completed SMS:', e));

    if (isRewardsProgramEnabled()) {
      const { data: partRows } = await admin
        .from('session_participants')
        .select('parent_id, attendance_status')
        .eq('session_id', sessionId)
        .eq('paid', true);
      const parentIds = [
        ...new Set(
          (partRows ?? [])
            .filter(
              (r: { attendance_status?: string | null }) =>
                !attendance || r.attendance_status === 'attended'
            )
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
