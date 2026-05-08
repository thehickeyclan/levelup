import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { grantRewardCredit, isRewardsProgramEnabled, isLegacyPromotionCreditsEnabled, SESSION_CASHBACK_RATE } from '@/lib/rewards';
import { createNotification } from '@/lib/notifications';
import { sendTransactionalEmail } from '@/lib/email/send-transactional';

export const dynamic = 'force-dynamic';

type EligibleParticipant = { id: string; parent_id: string; amount_paid: unknown };

async function loadEligible(admin: ReturnType<typeof createAdminClient>): Promise<EligibleParticipant[]> {
  const { data: parts, error: pErr } = await admin
    .from('session_participants')
    .select('id, parent_id, amount_paid')
    .eq('paid', true);
  if (pErr) throw new Error(pErr.message);

  const { data: earnRows, error: eErr } = await admin
    .from('credits')
    .select('session_participant_id')
    .eq('reward_type', 'session_earned')
    .not('session_participant_id', 'is', null);
  if (eErr) throw new Error(eErr.message);

  const hasEarn = new Set(
    (earnRows ?? [])
      .map((r) => (r as { session_participant_id: string | null }).session_participant_id)
      .filter(Boolean) as string[]
  );

  return (parts ?? []).filter((p) => !hasEarn.has((p as EligibleParticipant).id)) as EligibleParticipant[];
}

export async function GET() {
  if (!isRewardsProgramEnabled()) {
    return NextResponse.json({ error: 'Rewards program disabled' }, { status: 404 });
  }

  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  if (!isLegacyPromotionCreditsEnabled()) {
    return NextResponse.json({
      legacyPromotionsDisabled: true,
      message:
        'Retroactive session cashback is off. Parent wallet credits from automation are referrals (and RecruitNC transfers) unless REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED=true.',
    });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const { data: ran } = await admin
    .from('rewards_launch_bonus_runs')
    .select('id, ran_at, parents_affected, sessions_credited, total_amount_usd')
    .eq('tenant_slug', auth.tenantSlug)
    .maybeSingle();

  if (ran) {
    return NextResponse.json({
      alreadyRan: true,
      ranAt: (ran as { ran_at: string }).ran_at,
      summary: {
        parents: (ran as { parents_affected: number }).parents_affected,
        sessions: (ran as { sessions_credited: number }).sessions_credited,
        totalUsd: Number((ran as { total_amount_usd: unknown }).total_amount_usd ?? 0),
      },
    });
  }

  const eligible = await loadEligible(admin);
  const parents = new Set(eligible.map((p) => p.parent_id)).size;
  let totalUsd = 0;
  for (const p of eligible) {
    const ap = Number(p.amount_paid ?? 0);
    totalUsd += Number((ap * SESSION_CASHBACK_RATE).toFixed(2));
  }

  return NextResponse.json({
    alreadyRan: false,
    preview: {
      parentsAffected: parents,
      sessionsToCredit: eligible.length,
      totalCreditUsd: Number(totalUsd.toFixed(2)),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!isRewardsProgramEnabled()) {
    return NextResponse.json({ error: 'Rewards program disabled' }, { status: 404 });
  }

  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  if (!isLegacyPromotionCreditsEnabled()) {
    return NextResponse.json(
      {
        error:
          'Retroactive session credits are disabled. Set REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED=true to allow this run.',
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'confirm: true is required' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const { data: existing } = await admin
    .from('rewards_launch_bonus_runs')
    .select('id')
    .eq('tenant_slug', auth.tenantSlug)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Launch bonus has already been run for this tenant' }, { status: 400 });
  }

  const eligible = await loadEligible(admin);
  const byParentUsd = new Map<string, number>();
  let sessionsCredited = 0;
  let totalUsd = 0;

  for (const p of eligible) {
    const ap = Number(p.amount_paid ?? 0);
    const creditAmount = Number((ap * SESSION_CASHBACK_RATE).toFixed(2));
    if (creditAmount < 0.01) continue;

    const grantRes = await grantRewardCredit(admin, {
      parentId: p.parent_id,
      amount: creditAmount,
      rewardType: 'session_earned',
      sessionParticipantId: p.id,
      description: '5% back — retroactive launch bonus',
    });
    if (grantRes.error) {
      console.error('launch bonus grant', p.id, grantRes.error);
      continue;
    }
    sessionsCredited++;
    totalUsd += creditAmount;
    byParentUsd.set(p.parent_id, (byParentUsd.get(p.parent_id) ?? 0) + creditAmount);
  }

  const parentsAffected = byParentUsd.size;
  const { error: insErr } = await admin.from('rewards_launch_bonus_runs').insert({
    tenant_slug: auth.tenantSlug,
    admin_user_id: auth.userId,
    parents_affected: parentsAffected,
    sessions_credited: sessionsCredited,
    total_amount_usd: Number(totalUsd.toFixed(2)),
    note: 'Retroactive session_earned (5% of amount_paid)',
  });
  if (insErr) {
    console.error('launch bonus run log', insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: notifyUsers } = await admin
    .from('users')
    .select('id, email')
    .in('id', [...byParentUsd.keys()]);

  for (const u of notifyUsers ?? []) {
    const row = u as { id: string; email: string | null };
    const amt = byParentUsd.get(row.id) ?? 0;
    await createNotification(admin, {
      user_id: row.id,
      type: 'launch_bonus',
      title: 'You have Guild credits waiting 🎉',
      body: `We launched our rewards program and backdated 5% on your past sessions. You have $${amt.toFixed(2)} in Guild credit — applied automatically at your next checkout.`,
      data: { link: '/wallet' },
    }).catch(() => {});

    if (row.email) {
      void sendTransactionalEmail({
        to: row.email,
        subject: 'You have Guild credits waiting 🎉',
        html: `<p>We launched our rewards program and backdated 5% on all your past sessions. You have <strong>$${amt.toFixed(
          2
        )}</strong> in Guild credit — applied automatically at your next checkout.</p>`,
        text: `We launched our rewards program and backdated 5% on all your past sessions. You have $${amt.toFixed(
          2
        )} in Guild credit — applied automatically at your next checkout.`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    parentsAffected,
    sessionsCredited,
    totalUsd: Number(totalUsd.toFixed(2)),
  });
}
