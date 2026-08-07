import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';
import { formatEST } from '@/lib/format-date';
import { grantCredit } from '@/lib/credits';
import { isRewardsProgramEnabled, reverseSessionEarnedForParticipant } from '@/lib/rewards';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isParent = userData?.role === 'parent';
    const isAdmin = userData?.role === 'admin';
    const isAthlete = userData?.role === 'coach';

    if (!isParent && !isAdmin && !isAthlete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({})) as { reason?: string };
    const reason = body.reason || 'Cancelled by user';

    const admin = createAdminClient(tenant.slug);
    const { data: session, error: fetchError } = await admin
      .from('sessions')
      .select('*, athletes(id, first_name, last_name)')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const isOwner = session.parent_id === user.id;
    const isCoach = session.athlete_id === user.id;

    if (!isOwner && !isCoach && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to cancel this session' }, { status: 403 });
    }

    if (session.status === 'cancelled') {
      return NextResponse.json({ error: 'Session already cancelled' }, { status: 400 });
    }

    if (session.status !== 'scheduled') {
      return NextResponse.json({ error: 'Session cannot be cancelled' }, { status: 400 });
    }

    const scheduledTime = new Date(session.scheduled_datetime);
    const sessionDateKey = formatEST(scheduledTime, 'yyyy-MM-dd');
    const todayDateKey = formatEST(new Date(), 'yyyy-MM-dd');
    if (isParent && !isAdmin && sessionDateKey <= todayDateKey) {
      return NextResponse.json(
        {
          error:
            "You can't cancel a session on the day of training. Please message the coach or contact The Guild so we can help.",
        },
        { status: 400 }
      );
    }

    const { data: participants } = await admin
      .from('session_participants')
      .select('id, parent_id, youth_wrestler_id, amount_paid, paid')
      .eq('session_id', sessionId);

    if (isRewardsProgramEnabled()) {
      for (const participant of participants ?? []) {
        const pid = (participant as { id?: string; parent_id?: string }).id;
        const parId = (participant as { parent_id?: string | null }).parent_id;
        if (pid && parId) {
          await reverseSessionEarnedForParticipant(admin, {
            sessionParticipantId: pid,
            parentId: parId,
            sessionId,
          });
        }
      }
    }

    const sessionDate = formatEST(scheduledTime, 'EEE, MMM d');
    const coach = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
    const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ') : 'Coach';

    let creditsGranted = 0;
    let totalCreditsAmount = 0;
    /** Sum of credits issued per parent (for accurate notifications). */
    const creditByParent = new Map<string, number>();

    const cancellerMayIssueCredit = isCoach || isAdmin || isOwner;

    const recordSuccessfulGrant = (parentId: string, amount: number) => {
      creditsGranted++;
      totalCreditsAmount += amount;
      creditByParent.set(parentId, (creditByParent.get(parentId) ?? 0) + amount);
    };

    if (cancellerMayIssueCredit) {
      for (const participant of participants ?? []) {
        const p = participant as { amount_paid?: unknown; paid?: boolean | null; parent_id?: string | null };
        const amountPaid = Number(p.amount_paid ?? 0);
        // Only refund as wallet credit what was actually collected (paid row). Never use list/total_price
        // when checkout never completed — phantom liability on parent booking shells before cancel.
        if (amountPaid > 0 && p.paid === true && p.parent_id) {
          const result = await grantCredit({
            userId: p.parent_id,
            amount: amountPaid,
            reason:
              isCoach || isAdmin
                ? `Cancelled: ${sessionDate} with ${coachName}. ${reason}`
                : `Self-cancelled: ${sessionDate} with ${coachName}`,
            sourceType: 'cancellation',
            sourceId: sessionId,
            tenantSlug: tenant.slug,
          });
          if (result.success) {
            recordSuccessfulGrant(p.parent_id, amountPaid);
          }
        }
      }
    }

    const { error: updateError } = await admin
      .from('sessions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_reason: reason,
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to cancel session:', updateError);
      return NextResponse.json({ error: 'Failed to cancel session' }, { status: 500 });
    }

    if (participants && participants.length > 0) {
      await admin
        .from('session_participants')
        .update({ status: 'cancelled' })
        .eq('session_id', sessionId);
    }

    const when = formatEST(new Date(session.scheduled_datetime), 'MMM d, h:mm a');
    try {
      const parentIdsToNotify = new Set<string>();
      for (const participant of participants ?? []) {
        if (participant.parent_id) parentIdsToNotify.add(participant.parent_id);
      }
      if (parentIdsToNotify.size === 0 && session.parent_id) {
        parentIdsToNotify.add(session.parent_id as string);
      }
      for (const parentId of parentIdsToNotify) {
        const amt = creditByParent.get(parentId);
        const creditMsg =
          amt != null && amt > 0
            ? ` $${amt.toFixed(2)} was added to your wallet — usable on any coach.`
            : '';
        await createNotification(admin, {
          user_id: parentId,
          type: 'session_cancelled',
          title: 'Session cancelled',
          body: `Session on ${when} with ${coachName} was cancelled.${creditMsg}`,
          data: { link: '/bookings', session_id: sessionId },
        });
      }
      if (session.athlete_id !== user.id) {
        await createNotification(admin, {
          user_id: session.athlete_id,
          type: 'session_cancelled',
          title: 'Session cancelled',
          body: `Session on ${when} was cancelled.`,
          data: { link: '/athlete-dashboard', session_id: sessionId },
        });
      }
    } catch (notifErr) {
      console.warn('Notify cancel failed:', notifErr);
    }

    const message =
      totalCreditsAmount > 0
        ? `Session cancelled. $${totalCreditsAmount.toFixed(2)} wallet credit issued (${creditsGranted} grant(s)). Use it on any booking.`
        : 'Session cancelled.';

    return NextResponse.json({
      success: true,
      creditsGranted,
      totalCreditsAmount,
      message,
    });
  } catch (e) {
    console.error('Cancel session error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
