import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createMilestoneHitActivityPost } from '@/lib/activity-feed/create-posts';
import { createNotification } from '@/lib/notifications';
import { getUserCreditBalance } from '@/lib/credits';

/** Opt-in: set REWARDS_PROGRAM_ENABLED=true */
export function isRewardsProgramEnabled(): boolean {
  return process.env.REWARDS_PROGRAM_ENABLED === 'true';
}

/**
 * When false (default), `credits` rows with source `reward` may only be created for referral payouts
 * (`reward_type` referral_sent) or admin manual grants. Session milestones, review bonuses, per-session
 * cashback, and the retroactive launch bonus are off. RecruitNC → Guild inserts use source
 * recruitnc_transfer and are unaffected.
 * Opt back in with REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED=true.
 */
export function isLegacyPromotionCreditsEnabled(): boolean {
  return process.env.REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED === 'true';
}

export const SESSION_CASHBACK_RATE = 0.05;
export const REFERRAL_CREDIT_AMOUNT = 25;
/** Days after referred family's first paid booking before referrer credit is released */
export const REFERRAL_CREDIT_HOLD_DAYS = 3;

export type WalletLedgerRow = {
  id: string;
  kind: 'grant' | 'debit' | 'reversal';
  amount: number;
  description: string;
  createdAt: string;
  rewardType: string | null;
  sessionId: string | null;
};

export const SESSION_MILESTONE_DEFS = [
  { key: 'sessions_5', threshold: 5, amount: 5, rewardType: 'milestone_5', label: '5 sessions completed' },
  { key: 'sessions_10', threshold: 10, amount: 10, rewardType: 'milestone_10', label: '10 sessions completed' },
  { key: 'sessions_25', threshold: 25, amount: 20, rewardType: 'milestone_25', label: '25 sessions completed' },
] as const;

export function getNextSessionMilestoneProgress(completedCount: number): {
  nextThreshold: number | null;
  creditAtNext: number | null;
  label: string | null;
} {
  for (const def of SESSION_MILESTONE_DEFS) {
    if (completedCount < def.threshold) {
      return {
        nextThreshold: def.threshold,
        creditAtNext: def.amount,
        label: def.label,
      };
    }
  }
  return { nextThreshold: null, creditAtNext: null, label: null };
}

export async function grantRewardCredit(
  admin: SupabaseClient,
  opts: {
    parentId: string;
    amount: number;
    rewardType: string;
    description: string;
    sourceSessionId?: string | null;
    sessionParticipantId?: string | null;
    /** Only the admin manual-credit API should set this */
    adminManualGrant?: boolean;
  }
): Promise<{ creditId?: string; error?: string }> {
  if (opts.amount < 0.01) return {};

  const legacy = isLegacyPromotionCreditsEnabled();
  const isReferral = opts.rewardType === 'referral_sent';
  const isManual = opts.rewardType === 'manual' && opts.adminManualGrant === true;
  if (!legacy && !isReferral && !isManual) {
    return {
      error:
        'Automatic reward credits are limited to referrals. Enable REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED for milestones, reviews, or session cashback.',
    };
  }

  const { data, error } = await admin
    .from('credits')
    .insert({
      parent_id: opts.parentId,
      amount: opts.amount,
      remaining: opts.amount,
      source: 'reward',
      reward_type: opts.rewardType,
      description: opts.description,
      source_session_id: opts.sourceSessionId ?? null,
      session_participant_id: opts.sessionParticipantId ?? null,
      expires_at: null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { creditId: data.id as string };
}

/** 5% of cash paid for this roster row — idempotent per session_participant_id */
export async function issueSessionEarnedCredit(
  admin: SupabaseClient,
  opts: {
    tenantSlug: string;
    sessionId: string;
    parentId: string;
    sessionParticipantId: string;
    cashPaidDollars: number;
  }
): Promise<void> {
  if (!isRewardsProgramEnabled() || !isLegacyPromotionCreditsEnabled()) return;

  const creditAmount = Number((opts.cashPaidDollars * SESSION_CASHBACK_RATE).toFixed(2));
  if (creditAmount < 0.01) return;

  const { data: existing } = await admin
    .from('credits')
    .select('id')
    .eq('session_participant_id', opts.sessionParticipantId)
    .eq('reward_type', 'session_earned')
    .maybeSingle();
  if (existing) return;

  const { creditId, error } = await grantRewardCredit(admin, {
    parentId: opts.parentId,
    amount: creditAmount,
    rewardType: 'session_earned',
    description: '5% back on booking (cash paid)',
    sourceSessionId: opts.sessionId,
    sessionParticipantId: opts.sessionParticipantId,
  });

  if (error) {
    if (error.includes('duplicate') || error.includes('unique') || error.includes('23505')) return;
    console.error('issueSessionEarnedCredit:', error);
    return;
  }

  const balance = await getUserCreditBalance(opts.parentId, opts.tenantSlug);
  await createNotification(admin, {
    user_id: opts.parentId,
    type: 'credit_earned',
    title: 'Credit earned',
    body: `You earned $${creditAmount.toFixed(2)} on this booking. Wallet balance: $${balance.toFixed(2)}.`,
    data: { link: '/wallet', session_id: opts.sessionId },
  }).catch(() => {});
  void creditId;
}

export async function reverseSessionEarnedForParticipant(
  admin: SupabaseClient,
  opts: {
    sessionParticipantId: string;
    parentId: string;
    sessionId: string;
  }
): Promise<void> {
  if (!isRewardsProgramEnabled()) return;

  const { data: row } = await admin
    .from('credits')
    .select('id, amount, remaining')
    .eq('session_participant_id', opts.sessionParticipantId)
    .eq('reward_type', 'session_earned')
    .maybeSingle();

  if (!row) return;

  const remaining = Number(row.remaining ?? 0);
  const original = Number(row.amount ?? 0);
  const reversal = Math.min(remaining, original);
  if (reversal < 0.01) return;

  const nowIso = new Date().toISOString();
  await admin
    .from('credits')
    .update({ remaining: remaining - reversal, updated_at: nowIso })
    .eq('id', row.id);

  await admin.from('credit_reversals').insert({
    credit_id: row.id,
    parent_id: opts.parentId,
    amount: reversal,
    session_id: opts.sessionId,
    reason: 'Session cancelled — cashback clawback',
  });
}

export async function countPaidSessionSpotsForParent(admin: SupabaseClient, parentId: string): Promise<number> {
  const { count, error } = await admin
    .from('session_participants')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId)
    .eq('paid', true);
  if (error) {
    console.warn('countPaidSessionSpotsForParent:', error);
    return 0;
  }
  return count ?? 0;
}

/** After checkout: if this parent had zero paid spots before, complete referral and queue $25 */
export async function maybeCompleteReferralOnFirstPaidBooking(
  admin: SupabaseClient,
  opts: {
    tenantSlug: string;
    parentId: string;
    /** Any session id from this checkout (first paid session) */
    sessionId: string;
    paidSpotsBeforeCheckout: number;
  }
): Promise<void> {
  if (!isRewardsProgramEnabled()) return;
  if (opts.paidSpotsBeforeCheckout > 0) return;

  const { data: ref } = await admin
    .from('referrals')
    .select('id, referrer_id, status, first_session_id')
    .eq('referred_id', opts.parentId)
    .maybeSingle();

  if (!ref || ref.status !== 'pending' || ref.first_session_id) return;

  const nowIso = new Date().toISOString();
  const holdUntil = new Date(
    Date.now() + REFERRAL_CREDIT_HOLD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await admin
    .from('referrals')
    .update({
      first_session_id: opts.sessionId,
      status: 'awaiting_release',
      completed_at: nowIso,
    })
    .eq('id', ref.id);

  const { error: pendErr } = await admin.from('pending_referral_credits').insert({
    referral_id: ref.id,
    referrer_id: ref.referrer_id,
    amount: REFERRAL_CREDIT_AMOUNT,
    available_at: holdUntil,
  });
  if (pendErr) {
    if (pendErr.code === '23505') return;
    console.error('pending_referral_credits insert:', pendErr);
    return;
  }

  await createNotification(admin, {
    user_id: ref.referrer_id,
    type: 'referral_progress',
    title: 'Referral booking confirmed',
    body: `Your friend completed their first booking. $${REFERRAL_CREDIT_AMOUNT.toFixed(0)} credit will be added in about ${REFERRAL_CREDIT_HOLD_DAYS} days.`,
    data: { link: '/wallet' },
  }).catch(() => {});
}

/** Per-booking cashback disabled — milestones + referrals only. Kept for typing; always 0. */
export function previewCartSessionCashbackUsd(
  _catalogLineDollars: number[],
  _stripeCashTotalDollars: number
): number {
  return 0;
}

export async function issueSessionEarnedForCheckoutLines(
  admin: SupabaseClient,
  opts: {
    tenantSlug: string;
    parentId: string;
    lines: { sessionId: string; youthWrestlerId: string; catalogLineDollars: number }[];
    stripeCashTotalDollars: number;
    paidSpotsBeforeCheckout: number;
  }
): Promise<void> {
  if (!isRewardsProgramEnabled() || opts.lines.length === 0) return;

  /* No per-session session_earned grants — milestones + referrals only. */

  await maybeCompleteReferralOnFirstPaidBooking(admin, {
    tenantSlug: opts.tenantSlug,
    parentId: opts.parentId,
    sessionId: opts.lines[0].sessionId,
    paidSpotsBeforeCheckout: opts.paidSpotsBeforeCheckout,
  });
}

export async function countCompletedPaidSessionsForParent(
  admin: SupabaseClient,
  parentId: string
): Promise<number> {
  const { data: rows, error: spErr } = await admin
    .from('session_participants')
    .select('session_id, attendance_status')
    .eq('parent_id', parentId)
    .eq('paid', true);
  if (spErr) {
    console.warn('countCompletedPaidSessionsForParent:', spErr);
    return 0;
  }
  const sessionIds = [
    ...new Set(
      (rows ?? [])
        .filter(
          (r: { attendance_status?: string | null }) => r.attendance_status !== 'no_show'
        )
        .map((r: { session_id: string }) => r.session_id)
    ),
  ];
  if (sessionIds.length === 0) return 0;
  const { count, error: cErr } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .in('id', sessionIds)
    .eq('status', 'completed');
  if (cErr) {
    console.warn('countCompletedPaidSessionsForParent sessions:', cErr);
    return 0;
  }
  return count ?? 0;
}

export async function checkSessionMilestonesForParent(
  admin: SupabaseClient,
  opts: { tenantSlug: string; parentId: string }
): Promise<void> {
  if (!isRewardsProgramEnabled() || !isLegacyPromotionCreditsEnabled()) return;

  const n = await countCompletedPaidSessionsForParent(admin, opts.parentId);

  for (const m of SESSION_MILESTONE_DEFS) {
    if (n < m.threshold) continue;

    const { data: existing } = await admin
      .from('reward_milestones')
      .select('id')
      .eq('parent_id', opts.parentId)
      .eq('milestone', m.key)
      .maybeSingle();
    if (existing) continue;

    const { creditId, error } = await grantRewardCredit(admin, {
      parentId: opts.parentId,
      amount: m.amount,
      rewardType: m.rewardType,
      description: `Milestone: ${m.label}`,
    });
    if (error) {
      console.error('milestone grant:', error);
      continue;
    }

    const { data: milestoneRow } = await admin
      .from('reward_milestones')
      .insert({
        parent_id: opts.parentId,
        milestone: m.key,
        credit_id: creditId ?? null,
      })
      .select('id')
      .single();

    if (milestoneRow?.id) {
      await createMilestoneHitActivityPost(admin, {
        parentId: opts.parentId,
        milestoneId: milestoneRow.id,
        milestoneKey: m.key,
      });
    }

    await createNotification(admin, {
      user_id: opts.parentId,
      type: 'milestone',
      title: 'Milestone reached',
      body: `You hit ${m.label}! $${m.amount.toFixed(2)} was added to your Guild wallet.`,
      data: { link: '/wallet' },
    }).catch(() => {});
  }
}

export async function checkReviewRewardForSession(
  admin: SupabaseClient,
  opts: { tenantSlug: string; parentId: string; sessionId: string }
): Promise<void> {
  if (!isRewardsProgramEnabled() || !isLegacyPromotionCreditsEnabled()) return;

  const milestoneKey = `review:${opts.sessionId}`;
  const { data: existing } = await admin
    .from('reward_milestones')
    .select('id')
    .eq('parent_id', opts.parentId)
    .eq('milestone', milestoneKey)
    .maybeSingle();
  if (existing) return;

  const amount = 2;
  const { creditId, error } = await grantRewardCredit(admin, {
    parentId: opts.parentId,
    amount,
    rewardType: 'review',
    description: 'Thanks for leaving a review',
    sourceSessionId: opts.sessionId,
  });
  if (error) {
    console.error('review reward:', error);
    return;
  }

  await admin.from('reward_milestones').insert({
    parent_id: opts.parentId,
    milestone: milestoneKey,
    credit_id: creditId ?? null,
  });

  await createNotification(admin, {
    user_id: opts.parentId,
    type: 'review_reward',
    title: 'Review credit',
    body: `$${amount.toFixed(2)} added to your wallet for leaving a review. Thanks!`,
    data: { link: '/wallet', session_id: opts.sessionId },
  }).catch(() => {});
}

export async function getWalletLedger(parentId: string, tenantSlug: string, limit = 120): Promise<WalletLedgerRow[]> {
  const admin = createAdminClient(tenantSlug);

  const { data: creditIdRows } = await admin.from('credits').select('id').eq('parent_id', parentId);
  const creditIds = (creditIdRows ?? []).map((c: { id: string }) => c.id);

  const usagePromise =
    creditIds.length > 0
      ? admin
          .from('credit_usage')
          .select('id, amount, created_at, session_id')
          .in('credit_id', creditIds)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] as Record<string, unknown>[] });

  const [{ data: creditRows }, { data: revRows }, { data: usageRows }] = await Promise.all([
    admin
      .from('credits')
      .select('id, amount, description, reward_type, source, created_at, source_session_id')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(limit),
    admin
      .from('credit_reversals')
      .select('id, amount, reason, created_at, session_id')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(limit),
    usagePromise,
  ]);

  const out: WalletLedgerRow[] = [];

  for (const c of creditRows ?? []) {
    const row = c as {
      id: string;
      amount: unknown;
      description: string | null;
      reward_type: string | null;
      source: string;
      created_at: string;
      source_session_id: string | null;
    };
    out.push({
      id: `grant-${row.id}`,
      kind: 'grant',
      amount: Number(row.amount ?? 0),
      description: row.description || row.reward_type || row.source,
      createdAt: row.created_at,
      rewardType: row.reward_type,
      sessionId: row.source_session_id,
    });
  }

  for (const r of revRows ?? []) {
    const row = r as {
      id: string;
      amount: unknown;
      reason: string | null;
      created_at: string;
      session_id: string | null;
    };
    out.push({
      id: `rev-${row.id}`,
      kind: 'reversal',
      amount: -Math.abs(Number(row.amount ?? 0)),
      description: row.reason || 'Credit adjustment',
      createdAt: row.created_at,
      rewardType: null,
      sessionId: row.session_id,
    });
  }

  for (const u of usageRows ?? []) {
    const row = u as {
      id: string;
      amount: unknown;
      created_at: string;
      session_id: string | null;
    };
    out.push({
      id: `use-${row.id}`,
      kind: 'debit',
      amount: -Math.abs(Number(row.amount ?? 0)),
      description: 'Applied at checkout',
      createdAt: row.created_at,
      rewardType: null,
      sessionId: row.session_id,
    });
  }

  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return out.slice(0, limit);
}

/** Normalize referral code for storage / lookup */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function generateReferralCodeFromProfile(firstName: string | null | undefined, userId: string): string {
  const name = (firstName ?? 'friend').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'friend';
  const suffix = userId.replace(/-/g, '').slice(0, 8);
  return `${name}-${suffix}`;
}

export async function ensureReferralCodeForParent(
  admin: SupabaseClient,
  parentId: string
): Promise<string | null> {
  if (!isRewardsProgramEnabled()) return null;

  const { data: existing } = await admin.from('referral_codes').select('code').eq('parent_id', parentId).maybeSingle();
  if (existing?.code) return existing.code as string;

  const { data: userRow } = await admin
    .from('users')
    .select('first_name')
    .eq('id', parentId)
    .maybeSingle();
  const base = generateReferralCodeFromProfile(
    (userRow as { first_name?: string } | null)?.first_name,
    parentId
  );

  for (let i = 0; i < 8; i++) {
    const code = i === 0 ? base : `${base}${i}`;
    const { error } = await admin.from('referral_codes').insert({ parent_id: parentId, code });
    if (!error) return code;
    if (error.code !== '23505') {
      console.error('ensureReferralCodeForParent:', error);
      return null;
    }
  }
  return null;
}

export async function createReferralAttributionOnSignup(
  admin: SupabaseClient,
  opts: {
    referredUserId: string;
    referredEmailLower: string;
    referralCodeRaw: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRewardsProgramEnabled()) return { ok: true };

  const code = normalizeReferralCode(opts.referralCodeRaw);
  if (!code) return { ok: true };

  const { data: codeRow } = await admin.from('referral_codes').select('parent_id').eq('code', code).maybeSingle();
  if (!codeRow) return { ok: false, error: 'Invalid referral code' };

  const referrerId = (codeRow as { parent_id: string }).parent_id;
  if (referrerId === opts.referredUserId) {
    return { ok: false, error: 'You cannot use your own referral code' };
  }

  const [{ data: refUser }, { data: newUser }] = await Promise.all([
    admin.from('users').select('email').eq('id', referrerId).maybeSingle(),
    admin.from('users').select('email').eq('id', opts.referredUserId).maybeSingle(),
  ]);
  const e1 = ((refUser as { email?: string } | null)?.email ?? '').toLowerCase();
  const e2 = (newUser as { email?: string } | null)?.email?.toLowerCase() ?? opts.referredEmailLower;
  if (e1 && e2 && e1 === e2) {
    return { ok: false, error: 'Referral code cannot match your account email' };
  }

  const { error } = await admin.from('referrals').insert({
    referrer_id: referrerId,
    referred_id: opts.referredUserId,
    code,
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: error.message };
  }

  await admin.from('users').update({ signup_referral_code: code }).eq('id', opts.referredUserId);
  return { ok: true };
}

export async function expireStaleReferrals(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('referrals')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', nowIso)
    .select('id');
  if (error) {
    console.error('expireStaleReferrals:', error);
    return 0;
  }
  return (data ?? []).length;
}

export async function releaseDueReferralCredits(
  admin: SupabaseClient,
  tenantSlug: string
): Promise<{ released: number }> {
  if (!isRewardsProgramEnabled()) return { released: 0 };

  const nowIso = new Date().toISOString();
  const { data: pending } = await admin
    .from('pending_referral_credits')
    .select('id, referral_id, referrer_id, amount, frozen')
    .eq('released', false)
    .lte('available_at', nowIso)
    .or('frozen.is.null,frozen.eq.false')
    .limit(200);

  let released = 0;
  for (const row of pending ?? []) {
    const r = row as {
      id: string;
      referral_id: string;
      referrer_id: string;
      amount: unknown;
    };

    const { data: ref } = await admin
      .from('referrals')
      .select('status')
      .eq('id', r.referral_id)
      .maybeSingle();
    if (!ref || (ref as { status: string }).status === 'flagged') continue;

    const amt = Number(r.amount ?? REFERRAL_CREDIT_AMOUNT);
    const { creditId, error: gErr } = await grantRewardCredit(admin, {
      parentId: r.referrer_id,
      amount: amt,
      rewardType: 'referral_sent',
      description: 'Referral — friend completed first booking',
    });
    if (gErr) {
      console.error('release referral credit:', gErr);
      continue;
    }

    await admin
      .from('pending_referral_credits')
      .update({ released: true, released_at: nowIso, credit_id: creditId ?? null })
      .eq('id', r.id);

    await admin
      .from('referrals')
      .update({ status: 'completed', referrer_credit_id: creditId ?? null })
      .eq('id', r.referral_id);

    const balance = await getUserCreditBalance(r.referrer_id, tenantSlug);
    await createNotification(admin, {
      user_id: r.referrer_id,
      type: 'referral_completed',
      title: 'Referral credit added',
      body: `$${amt.toFixed(2)} was added to your wallet. Balance: $${balance.toFixed(2)}.`,
      data: { link: '/wallet' },
    }).catch(() => {});

    released++;
  }

  return { released };
}

export async function adminRevokeCreditGrant(
  admin: SupabaseClient,
  opts: { creditId: string; parentId: string; amount: number; reason: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const amt = Number(opts.amount);
  if (amt < 0.01) return { ok: false, error: 'Amount too small' };

  const { data: row, error: fErr } = await admin
    .from('credits')
    .select('id, parent_id, remaining')
    .eq('id', opts.creditId)
    .maybeSingle();
  if (fErr || !row) return { ok: false, error: 'Credit not found' };
  if ((row as { parent_id: string }).parent_id !== opts.parentId) {
    return { ok: false, error: 'Credit does not belong to this parent' };
  }

  const remaining = Number((row as { remaining: unknown }).remaining ?? 0);
  if (amt > remaining + 0.001) return { ok: false, error: 'Amount exceeds remaining on this grant' };

  const nowIso = new Date().toISOString();
  const { error: uErr } = await admin
    .from('credits')
    .update({ remaining: remaining - amt, updated_at: nowIso })
    .eq('id', opts.creditId);
  if (uErr) return { ok: false, error: uErr.message };

  await admin.from('credit_reversals').insert({
    credit_id: opts.creditId,
    parent_id: opts.parentId,
    amount: amt,
    session_id: null,
    reason: opts.reason,
  });

  return { ok: true };
}

export async function releaseReferralCreditEarly(
  admin: SupabaseClient,
  opts: { referralId: string; tenantSlug: string; reason: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  void opts.reason;

  const { data: ref } = await admin
    .from('referrals')
    .select('id, referrer_id, status, referrer_credit_id')
    .eq('id', opts.referralId)
    .maybeSingle();
  if (!ref) return { ok: false, error: 'Referral not found' };

  const st = (ref as { status: string }).status;
  if (st === 'flagged') return { ok: false, error: 'Referral is flagged' };
  if ((ref as { referrer_credit_id?: string | null }).referrer_credit_id) {
    return { ok: false, error: 'Credit already issued for this referral' };
  }
  if (st !== 'awaiting_release') {
    return { ok: false, error: 'Referral is not waiting on credit release' };
  }

  const { data: pend } = await admin
    .from('pending_referral_credits')
    .select('id, referrer_id, amount, released, frozen')
    .eq('referral_id', opts.referralId)
    .maybeSingle();
  if (!pend || (pend as { released: boolean }).released) {
    return { ok: false, error: 'No pending referral credit' };
  }
  if ((pend as { frozen?: boolean }).frozen === true) {
    return { ok: false, error: 'Pending credit is frozen' };
  }

  const nowIso = new Date().toISOString();
  const r = pend as { id: string; referrer_id: string; amount: unknown };
  const amt = Number(r.amount ?? REFERRAL_CREDIT_AMOUNT);

  const { creditId, error: gErr } = await grantRewardCredit(admin, {
    parentId: r.referrer_id,
    amount: amt,
    rewardType: 'referral_sent',
    description: 'Referral — friend completed first booking (released early)',
  });
  if (gErr) return { ok: false, error: gErr };

  await admin
    .from('pending_referral_credits')
    .update({ released: true, released_at: nowIso, credit_id: creditId ?? null, frozen: false })
    .eq('id', r.id);

  await admin
    .from('referrals')
    .update({ status: 'completed', referrer_credit_id: creditId ?? null })
    .eq('id', opts.referralId);

  const balance = await getUserCreditBalance(r.referrer_id, opts.tenantSlug);
  await createNotification(admin, {
    user_id: r.referrer_id,
    type: 'referral_completed',
    title: 'Referral credit added',
    body: `$${amt.toFixed(2)} was added to your wallet. Balance: $${balance.toFixed(2)}.`,
    data: { link: '/wallet' },
  }).catch(() => {});

  return { ok: true };
}

export async function flagReferral(
  admin: SupabaseClient,
  opts: { referralId: string; note: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: ref } = await admin
    .from('referrals')
    .select('id, status')
    .eq('id', opts.referralId)
    .maybeSingle();
  if (!ref) return { ok: false, error: 'Referral not found' };
  const cur = (ref as { status: string }).status;
  if (cur === 'flagged') return { ok: false, error: 'Already flagged' };

  const { error: uErr } = await admin
    .from('referrals')
    .update({
      status: 'flagged',
      status_before_flag: cur,
      flagged_reason: opts.note,
    })
    .eq('id', opts.referralId);
  if (uErr) return { ok: false, error: uErr.message };

  await admin.from('pending_referral_credits').update({ frozen: true }).eq('referral_id', opts.referralId);

  return { ok: true };
}

export async function unflagReferral(
  admin: SupabaseClient,
  opts: { referralId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: ref } = await admin
    .from('referrals')
    .select('id, status, status_before_flag')
    .eq('id', opts.referralId)
    .maybeSingle();
  if (!ref) return { ok: false, error: 'Referral not found' };
  if ((ref as { status: string }).status !== 'flagged') {
    return { ok: false, error: 'Not flagged' };
  }

  const prev = (ref as { status_before_flag: string | null }).status_before_flag || 'pending';

  const { error: uErr } = await admin
    .from('referrals')
    .update({
      status: prev,
      status_before_flag: null,
      flagged_reason: null,
    })
    .eq('id', opts.referralId);
  if (uErr) return { ok: false, error: uErr.message };

  await admin.from('pending_referral_credits').update({ frozen: false }).eq('referral_id', opts.referralId);

  return { ok: true };
}
