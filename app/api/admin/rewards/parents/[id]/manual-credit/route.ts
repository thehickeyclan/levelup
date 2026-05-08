import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { grantRewardCredit, isRewardsProgramEnabled } from '@/lib/rewards';
import { getUserCreditBalance } from '@/lib/credits';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isRewardsProgramEnabled()) {
    return NextResponse.json({ error: 'Rewards program disabled' }, { status: 404 });
  }

  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id: parentId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isFinite(amount) || amount < 0.01) {
    return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const { data: u } = await admin.from('users').select('id, role').eq('id', parentId).maybeSingle();
  if (!u || (u as { role: string }).role !== 'parent') {
    return NextResponse.json({ error: 'Parent not found' }, { status: 400 });
  }

  const { creditId, error } = await grantRewardCredit(admin, {
    parentId,
    amount: Number(amount.toFixed(2)),
    rewardType: 'manual',
    description: reason,
    adminManualGrant: true,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  const balance = await getUserCreditBalance(parentId, auth.tenantSlug);
  await createNotification(admin, {
    user_id: parentId,
    type: 'credit_earned',
    title: 'Guild credit added',
    body: `We added $${amount.toFixed(2)} to your wallet. Balance: $${balance.toFixed(2)}.`,
    data: { link: '/wallet' },
  }).catch(() => {});

  return NextResponse.json({ ok: true, creditId });
}
