import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { syncSessionParticipantCount } from '@/lib/transfer-session-registration';
import { grantCredit } from '@/lib/credits';
import { createNotification } from '@/lib/notifications';
import { formatEST } from '@/lib/format-date';
import { isRewardsProgramEnabled, reverseSessionEarnedForParticipant } from '@/lib/rewards';

/**
 * POST - Parent leaves a session they joined (e.g. small group).
 * Removes their participant row(s), issues wallet credit for paid spots, opens capacity.
 * Session owner must use the full "cancel session" flow instead.
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
    if (userData?.role !== 'parent' && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Only parents can leave a session' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({})) as { youth_wrestler_id?: string };
    const youthWrestlerId =
      typeof body.youth_wrestler_id === 'string' && body.youth_wrestler_id.trim()
        ? body.youth_wrestler_id.trim()
        : null;

    const admin = createAdminClient(tenant.slug);
    const { data: session, error: sessionErr } = await admin
      .from('sessions')
      .select('id, parent_id, athlete_id, status, scheduled_datetime, athletes(first_name, last_name)')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const s = session as {
      parent_id?: string;
      athlete_id?: string;
      status?: string;
      scheduled_datetime: string;
    };
    if (s.parent_id === user.id) {
      return NextResponse.json(
        { error: "You're the session owner. Use Cancel session to cancel the whole session, or Reschedule to change it." },
        { status: 400 }
      );
    }

    if (s.status !== 'scheduled') {
      return NextResponse.json({ error: 'Session can no longer be left' }, { status: 400 });
    }

    let rowsQuery = admin
      .from('session_participants')
      .select('id, youth_wrestler_id, amount_paid, paid, parent_id')
      .eq('session_id', sessionId)
      .eq('parent_id', user.id);

    if (youthWrestlerId) {
      rowsQuery = rowsQuery.eq('youth_wrestler_id', youthWrestlerId);
    }

    const { data: myRows, error: rowsErr } = await rowsQuery;

    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    if (!myRows?.length) {
      return NextResponse.json(
        { error: youthWrestlerId ? 'This athlete is not on this session' : 'You have no spot in this session' },
        { status: 400 }
      );
    }

    const coach = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
    const coachName = coach
      ? [coach.first_name, coach.last_name].filter(Boolean).join(' ')
      : 'Coach';
    const sessionDate = formatEST(new Date(s.scheduled_datetime), 'EEE, MMM d');
    const when = formatEST(new Date(s.scheduled_datetime), 'MMM d, h:mm a');

    let totalCreditsAmount = 0;
    let creditsGranted = 0;

    for (const row of myRows) {
      const participantId = row.id as string;
      const amountPaid = Math.round(Number(row.amount_paid ?? 0) * 100) / 100;

      if (isRewardsProgramEnabled()) {
        await reverseSessionEarnedForParticipant(admin, {
          sessionParticipantId: participantId,
          parentId: user.id,
          sessionId,
        });
      }

      if (amountPaid > 0 && row.paid === true) {
        const result = await grantCredit({
          userId: user.id,
          amount: amountPaid,
          reason: `Self-removed from session: ${sessionDate} with ${coachName}`,
          sourceType: 'cancellation',
          sourceId: sessionId,
          tenantSlug: tenant.slug,
        });
        if (result.success) {
          creditsGranted++;
          totalCreditsAmount += amountPaid;
        }
      }
    }

    const rowIds = myRows.map((r) => r.id as string);
    const { error: deleteErr } = await admin
      .from('session_participants')
      .delete()
      .in('id', rowIds);

    if (deleteErr) {
      console.error('Leave session delete error:', deleteErr);
      return NextResponse.json({ error: 'Failed to leave session' }, { status: 500 });
    }

    await syncSessionParticipantCount(admin, sessionId);

    try {
      const creditMsg =
        totalCreditsAmount > 0
          ? ` $${totalCreditsAmount.toFixed(2)} was added to your wallet — usable on any coach.`
          : '';
      await createNotification(admin, {
        user_id: user.id,
        type: 'session_cancelled',
        title: 'Removed from session',
        body: `You left the session on ${when} with ${coachName}.${creditMsg}`,
        data: { link: '/bookings', session_id: sessionId },
      });
      if (s.athlete_id) {
        await createNotification(admin, {
          user_id: s.athlete_id,
          type: 'session_cancelled',
          title: 'Athlete left session',
          body: `A family left the session on ${when}. Their spot is open again.`,
          data: { link: '/athlete-dashboard', session_id: sessionId },
        });
      }
    } catch (notifErr) {
      console.warn('Notify leave session failed:', notifErr);
    }

    const count = myRows.length;
    const baseMessage =
      count === 1
        ? "You've left the session. Your spot is open again."
        : `You've left the session. ${count} spot(s) are open again.`;
    const message =
      totalCreditsAmount > 0
        ? `${baseMessage} $${totalCreditsAmount.toFixed(2)} wallet credit issued — use it on any booking.`
        : baseMessage;

    return NextResponse.json({
      success: true,
      creditsGranted,
      totalCreditsAmount,
      message,
    });
  } catch (e) {
    console.error('Leave session error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
