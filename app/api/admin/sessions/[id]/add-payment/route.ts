import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

/**
 * POST /api/admin/sessions/[id]/add-payment
 * Add a manual payment record (e.g., cash, check) to a session
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

  // Auth check - must be admin
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { amount, paymentMethod } = body;

  if (typeof amount !== 'number' || amount < 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const admin = createAdminClient(tenant.slug);

  // Get the session to find parent_id for the participant record
  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, parent_id, current_participants')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Insert a manual payment record into session_participants
  // We use the session's parent_id as a placeholder, or could create a special "cash_payment" parent
  const { error: insertError } = await admin
    .from('session_participants')
    .insert({
      session_id: sessionId,
      /** Organizer’s user id (session owner); required FK. No youth row for pure revenue / drop-in cash. */
      parent_id: session.parent_id,
      amount_paid: amount,
      paid: true,
      payment_method: paymentMethod || 'cash',
      status: 'confirmed',
    });

  if (insertError) {
    console.error('[Admin] Failed to add manual payment:', insertError);
    return NextResponse.json(
      { error: insertError.message || 'Failed to add payment' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
