import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { syncSessionParticipantCount } from '@/lib/transfer-session-registration';

/**
 * POST /api/admin/sessions/[id]/add-payment
 * Record manual payment (cash, check, Venmo, etc.) — works after session is marked complete.
 *
 * Body:
 * - amount (number, required)
 * - paymentMethod (optional)
 * - participantId (optional) — mark existing roster row paid instead of inserting
 * - youthWrestlerId + parentId (optional) — new paid registration row
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
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

  const body = await request.json();
  const amount = Number(body?.amount);
  const paymentMethod = String(body?.paymentMethod ?? 'cash').slice(0, 50);
  const participantId = typeof body?.participantId === 'string' ? body.participantId.trim() : '';
  const youthWrestlerId =
    typeof body?.youthWrestlerId === 'string' ? body.youthWrestlerId.trim() : '';
  const parentIdBody = typeof body?.parentId === 'string' ? body.parentId.trim() : '';

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const admin = createAdminClient(tenant.slug);

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, parent_id, status, current_participants')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const status = (session as { status?: string }).status;
  if (status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot record payment on a cancelled session' }, { status: 400 });
  }

  if (participantId) {
    const { data: row, error: fetchErr } = await admin
      .from('session_participants')
      .select('id, session_id')
      .eq('id', participantId)
      .maybeSingle();
    if (fetchErr || !row || row.session_id !== sessionId) {
      return NextResponse.json({ error: 'Participant not found on this session' }, { status: 404 });
    }
    const { error: updateErr } = await admin
      .from('session_participants')
      .update({
        paid: true,
        amount_paid: amount,
        payment_method: paymentMethod,
        status: 'confirmed',
      })
      .eq('id', participantId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message || 'Failed to mark paid' }, { status: 500 });
    }
    return NextResponse.json({ success: true, participantId });
  }

  let parentId: string | null = parentIdBody || null;
  if (youthWrestlerId && !parentId) {
    const { data: yw } = await admin
      .from('youth_wrestlers')
      .select('parent_id')
      .eq('id', youthWrestlerId)
      .maybeSingle();
    parentId = (yw as { parent_id?: string } | null)?.parent_id ?? null;
  }
  if (!parentId) {
    parentId = (session as { parent_id?: string }).parent_id ?? null;
  }
  if (!parentId) {
    return NextResponse.json(
      { error: 'parent_id required — link a wrestler or set session organizer' },
      { status: 400 }
    );
  }

  const { error: insertError } = await admin.from('session_participants').insert({
    session_id: sessionId,
    youth_wrestler_id: youthWrestlerId || null,
    parent_id: parentId,
    amount_paid: amount,
    paid: true,
    payment_method: paymentMethod,
    status: 'confirmed',
  });

  if (insertError) {
    console.error('[Admin] Failed to add manual payment:', insertError);
    return NextResponse.json(
      { error: insertError.message || 'Failed to add payment' },
      { status: 500 }
    );
  }

  await syncSessionParticipantCount(admin, sessionId);

  return NextResponse.json({ success: true });
}
