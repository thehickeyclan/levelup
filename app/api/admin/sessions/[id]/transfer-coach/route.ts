import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';
import { formatEST } from '@/lib/format-date';

/**
 * Admin: move a scheduled session to a different coach. Roster and payments
 * stay untouched; families and both coaches are notified. Built after a coach
 * conflict required a manual cancel → credit → text → rebook dance.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admins only' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { newCoachId?: string };
    const newCoachId = body.newCoachId?.trim();
    if (!newCoachId) return NextResponse.json({ error: 'newCoachId is required' }, { status: 400 });

    const admin = createAdminClient(tenant.slug);
    const { data: session } = await admin
      .from('sessions')
      .select('id, status, scheduled_datetime, athlete_id')
      .eq('id', sessionId)
      .single();
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.status !== 'scheduled') {
      return NextResponse.json({ error: 'Only scheduled sessions can be transferred' }, { status: 400 });
    }
    if (session.athlete_id === newCoachId) {
      return NextResponse.json({ error: 'Session already belongs to that coach' }, { status: 400 });
    }

    const [{ data: oldCoach }, { data: newCoach }] = await Promise.all([
      admin.from('athletes').select('id, first_name, last_name').eq('id', session.athlete_id).maybeSingle(),
      admin.from('athletes').select('id, first_name, last_name, active').eq('id', newCoachId).maybeSingle(),
    ]);
    if (!newCoach) return NextResponse.json({ error: 'New coach not found' }, { status: 404 });

    // session_payout_rate cleared so the payout resolves from the NEW coach's
    // default rate rather than the old coach's session-pinned rate.
    const { error: updateError } = await admin
      .from('sessions')
      .update({ athlete_id: newCoachId, session_payout_rate: null })
      .eq('id', sessionId);
    if (updateError) {
      console.error('transfer-coach update:', updateError);
      return NextResponse.json({ error: 'Failed to transfer session' }, { status: 500 });
    }

    const when = formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d, h:mm a');
    const oldName = oldCoach ? [oldCoach.first_name, oldCoach.last_name].filter(Boolean).join(' ') : 'your coach';
    const newName = [newCoach.first_name, newCoach.last_name].filter(Boolean).join(' ');

    const { data: participants } = await admin
      .from('session_participants')
      .select('parent_id')
      .eq('session_id', sessionId);
    const parentIds = [...new Set((participants ?? []).map((p) => p.parent_id).filter(Boolean))] as string[];

    for (const parentId of parentIds) {
      await createNotification(admin, {
        user_id: parentId,
        type: 'session_updated',
        title: 'Coach change',
        body: `Your session on ${when} is now coached by ${newName} (was ${oldName}). Same time, same place, nothing else changes.`,
        data: { link: '/bookings', session_id: sessionId },
      });
    }
    await createNotification(admin, {
      user_id: newCoachId,
      type: 'session_updated',
      title: 'Session transferred to you',
      body: `You are now coaching the ${when} session (taken over from ${oldName}). Check your schedule for the roster.`,
      data: { link: '/coach-sessions', session_id: sessionId },
    });
    if (session.athlete_id) {
      await createNotification(admin, {
        user_id: session.athlete_id,
        type: 'session_updated',
        title: 'Session transferred',
        body: `Your ${when} session was transferred to ${newName}. You are no longer coaching it.`,
        data: { session_id: sessionId },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Session transferred to ${newName}. ${parentIds.length} ${parentIds.length === 1 ? 'family' : 'families'} and both coaches were notified.`,
    });
  } catch (e) {
    console.error('transfer-coach:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
