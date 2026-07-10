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

type RemoveParticipantBody = {
  acknowledgePaidRemoval?: boolean;
  creditParent?: boolean;
  reason?: string;
};

async function parseRemoveBody(req: NextRequest): Promise<RemoveParticipantBody> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as RemoveParticipantBody;
  } catch {
    return {};
  }
}

/**
 * PATCH — Mark an existing roster row paid (admin only). Use after session is complete for cash/Venmo/etc.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { id: sessionId, participantId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const amount = body?.amount_paid != null ? Number(body.amount_paid) : body?.amount != null ? Number(body.amount) : null;
    const paymentMethod =
      typeof body?.payment_method === 'string'
        ? body.payment_method
        : typeof body?.paymentMethod === 'string'
          ? body.paymentMethod
          : 'cash';

    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: row, error: fetchErr } = await admin
      .from('session_participants')
      .select('id, session_id, stripe_payment_intent_id')
      .eq('id', participantId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!row || row.session_id !== sessionId) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    const pi = (row as { stripe_payment_intent_id?: string | null }).stripe_payment_intent_id;
    if (pi && String(pi).trim() !== '' && body?.force !== true) {
      return NextResponse.json(
        {
          error:
            'This row is linked to Stripe. Refund or adjust in Stripe, or pass force: true to overwrite for ops fixes.',
          code: 'STRIPE_LINKED',
        },
        { status: 400 }
      );
    }

    const { error: updateErr } = await admin
      .from('session_participants')
      .update({
        paid: true,
        amount_paid: amount,
        payment_method: paymentMethod.slice(0, 50),
        status: 'confirmed',
      })
      .eq('id', participantId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE — Remove a session participant row (admin only).
 * Stripe-linked rows require JSON body `{ "acknowledgePaidRemoval": true }` unless `{ "creditParent": true }`.
 * With `creditParent: true`, paid spots receive Guild wallet credit (session stays scheduled for others).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { id: sessionId, participantId } = await params;
    const body = await parseRemoveBody(req);
    const creditParent = body.creditParent === true;
    const reason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'Removed by admin';
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);

    const { data: session, error: sessionErr } = await admin
      .from('sessions')
      .select('id, status, scheduled_datetime, athletes(first_name, last_name)')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (creditParent && session.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Wallet credit removal is only available for scheduled sessions' },
        { status: 400 }
      );
    }

    const { data: row, error: fetchErr } = await admin
      .from('session_participants')
      .select(
        'id, session_id, parent_id, amount_paid, paid, youth_wrestler_id, stripe_payment_intent_id'
      )
      .eq('id', participantId)
      .maybeSingle();

    let rowData: {
      session_id?: string;
      parent_id?: string | null;
      amount_paid?: number | null;
      paid?: boolean | null;
      youth_wrestler_id?: string | null;
      stripe_payment_intent_id?: string | null;
    } | null = row;
    if (fetchErr && (fetchErr.message ?? '').includes('stripe_payment_intent_id')) {
      const retry = await admin
        .from('session_participants')
        .select('id, session_id, parent_id, amount_paid, paid, youth_wrestler_id')
        .eq('id', participantId)
        .maybeSingle();
      rowData = retry.data as typeof rowData;
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
    } else if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!rowData || rowData.session_id !== sessionId) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    const acknowledgePaidRemoval =
      body.acknowledgePaidRemoval === true || creditParent;

    const pi = rowData.stripe_payment_intent_id;
    const hasPi = pi != null && String(pi).trim() !== '';
    if (hasPi && !acknowledgePaidRemoval) {
      return NextResponse.json(
        {
          error:
            'This registration is linked to a Stripe payment. Use Remove & credit in admin, or refund in Stripe first.',
          code: 'STRIPE_LINKED',
        },
        { status: 400 }
      );
    }

    const amountPaid = Math.round(Number(rowData.amount_paid ?? 0) * 100) / 100;
    const parentId = rowData.parent_id ?? null;
    let creditGranted = 0;

    if (creditParent) {
      if (isRewardsProgramEnabled() && rowData.parent_id) {
        await reverseSessionEarnedForParticipant(admin, {
          sessionParticipantId: participantId,
          parentId: rowData.parent_id,
          sessionId,
        });
      }

      if (amountPaid > 0 && rowData.paid === true && parentId) {
        const coach = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
        const coachName = coach
          ? [coach.first_name, coach.last_name].filter(Boolean).join(' ')
          : 'Coach';
        const sessionDate = formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d');
        const result = await grantCredit({
          userId: parentId,
          amount: amountPaid,
          reason: `Removed from session: ${sessionDate} with ${coachName}. ${reason}`,
          sourceType: 'cancellation',
          sourceId: sessionId,
          tenantSlug: tenant.slug,
        });
        if (!result.success) {
          return NextResponse.json(
            { error: result.error || 'Failed to issue wallet credit' },
            { status: 500 }
          );
        }
        creditGranted = amountPaid;
      }
    }

    const { error: delErr } = await admin.from('session_participants').delete().eq('id', participantId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await syncSessionParticipantCount(admin, sessionId);

    if (creditParent && parentId) {
      try {
        const coach = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
        const coachName = coach
          ? [coach.first_name, coach.last_name].filter(Boolean).join(' ')
          : 'Coach';
        const when = formatEST(new Date(session.scheduled_datetime), 'MMM d, h:mm a');
        const creditMsg =
          creditGranted > 0
            ? ` $${creditGranted.toFixed(2)} was added to your wallet — usable on any coach.`
            : '';
        await createNotification(admin, {
          user_id: parentId,
          type: 'session_cancelled',
          title: 'Removed from session',
          body: `Your wrestler was removed from the session on ${when} with ${coachName}.${creditMsg}`,
          data: { link: '/bookings', session_id: sessionId },
        });
      } catch (notifErr) {
        console.warn('Notify participant removal failed:', notifErr);
      }
    }

    const message =
      creditGranted > 0
        ? `Removed from session. $${creditGranted.toFixed(2)} wallet credit issued.`
        : 'Removed from session.';

    return NextResponse.json({ success: true, creditGranted, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
