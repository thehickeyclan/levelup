import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
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
  if (userData?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderId } = await params;
  const admin = createAdminClient(tenant.slug);
  const now = new Date().toISOString();
  const body = (await req.json().catch(() => ({}))) as {
    method?: string;
    reference?: string;
    note?: string;
  };

  const method = (body.method || 'other').trim().toLowerCase();
  const allowedMethods = new Set(['venmo', 'zelle', 'cash', 'check', 'other']);
  const seller_payout_method = allowedMethods.has(method) ? method : 'other';
  const seller_payout_reference = body.reference?.trim() || null;
  const seller_payout_note = body.note?.trim() || null;

  const { error } = await admin
    .from('market_orders')
    .update({
      seller_paid_at: now,
      seller_payout_method,
      seller_payout_reference,
      seller_payout_note,
    })
    .eq('id', orderId)
    .is('seller_paid_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
