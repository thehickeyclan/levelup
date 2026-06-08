import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { syncSessionParticipantCount } from '@/lib/transfer-session-registration';

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
 * Stripe-linked rows require JSON body `{ "acknowledgePaidRemoval": true }` after refund / intentional roster fix.
 */
export async function DELETE(
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

    const admin = createAdminClient(tenant.slug);
    const { data: row, error: fetchErr } = await admin
      .from('session_participants')
      .select('id, session_id, stripe_payment_intent_id')
      .eq('id', participantId)
      .maybeSingle();

    let rowData: {
      session_id?: string;
      stripe_payment_intent_id?: string | null;
    } | null = row;
    if (fetchErr && (fetchErr.message ?? '').includes('stripe_payment_intent_id')) {
      const retry = await admin
        .from('session_participants')
        .select('id, session_id')
        .eq('id', participantId)
        .maybeSingle();
      rowData = retry.data as typeof rowData;
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
    } else if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!rowData || (rowData as { session_id?: string }).session_id !== sessionId) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    let acknowledgePaidRemoval = false;
    try {
      const text = await req.text();
      if (text.trim()) {
        const body = JSON.parse(text) as { acknowledgePaidRemoval?: boolean };
        acknowledgePaidRemoval = body?.acknowledgePaidRemoval === true;
      }
    } catch {
      /* no/invalid body */
    }

    const pi = (rowData as { stripe_payment_intent_id?: string | null }).stripe_payment_intent_id;
    const hasPi = pi != null && String(pi).trim() !== '';
    if (hasPi && !acknowledgePaidRemoval) {
      return NextResponse.json(
        {
          error:
            'This registration is linked to a Stripe payment. Use Remove in admin and confirm, or refund in Stripe first.',
          code: 'STRIPE_LINKED',
        },
        { status: 400 }
      );
    }

    const { error: delErr } = await admin.from('session_participants').delete().eq('id', participantId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await syncSessionParticipantCount(admin, sessionId);

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
