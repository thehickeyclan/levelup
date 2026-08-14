import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import {
  countCompletedPaidSessionsForParent,
  ensureReferralCodeForParent,
  getNextSessionMilestoneProgress,
  isLegacyPromotionCreditsEnabled,
  isRewardsProgramEnabled,
  REFERRAL_CREDIT_AMOUNT,
  REFERRAL_SIGNUP_CREDIT_AMOUNT,
} from '@/lib/rewards';

export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantByDomain(headersList.get('host') || '');
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'parent' && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const enabled = isRewardsProgramEnabled();
    if (!enabled) {
      return NextResponse.json({
        rewardsEnabled: false,
        referralCode: null,
        referralLink: null,
        completedReferrals: 0,
        pendingReferrals: 0,
        completedSessions: 0,
        nextMilestone: null,
        sessionMilestoneRewardsEnabled: false,
        referralCreditAmountDefault: REFERRAL_CREDIT_AMOUNT,
        referralSignupCreditAmount: REFERRAL_SIGNUP_CREDIT_AMOUNT,
      });
    }

    const admin = createAdminClient(tenant.slug);
    const referralCode = await ensureReferralCodeForParent(admin, user.id);

    const host = headersList.get('host') || '';
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`).replace(/\/$/, '');
    const referralLink = referralCode
      ? `${baseUrl}/signup?ref=${encodeURIComponent(referralCode)}`
      : null;

    const [{ count: completedRef }, { count: pendingSignup }, { count: awaitingRelease }] = await Promise.all([
      admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', user.id).eq('status', 'completed'),
      admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', user.id).eq('status', 'pending'),
      admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', user.id).eq('status', 'awaiting_release'),
    ]);

    const { data: nextHoldRow } = await admin
      .from('pending_referral_credits')
      .select('available_at, amount')
      .eq('referrer_id', user.id)
      .eq('released', false)
      .order('available_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextReferralCreditAvailableAt =
      (nextHoldRow as { available_at?: string } | null)?.available_at ?? null;
    const nextReferralCreditAmount = nextHoldRow
      ? Number((nextHoldRow as { amount?: unknown }).amount ?? 25)
      : null;

    const completedSessions = await countCompletedPaidSessionsForParent(admin, user.id);
    const milestonesOn = isLegacyPromotionCreditsEnabled();
    const nextMilestone = milestonesOn ? getNextSessionMilestoneProgress(completedSessions) : null;

    return NextResponse.json({
      rewardsEnabled: true,
      referralCode,
      referralLink,
      completedReferrals: completedRef ?? 0,
      /** @deprecated use referralAwaitingFirstBooking + referralCreditOnHold */
      pendingReferrals: (pendingSignup ?? 0) + (awaitingRelease ?? 0),
      referralAwaitingFirstBooking: pendingSignup ?? 0,
      referralCreditOnHold: awaitingRelease ?? 0,
      nextReferralCreditAvailableAt,
      nextReferralCreditAmount,
      completedSessions,
      nextMilestone,
      sessionMilestoneRewardsEnabled: milestonesOn,
      referralCreditAmountDefault: REFERRAL_CREDIT_AMOUNT,
      referralSignupCreditAmount: REFERRAL_SIGNUP_CREDIT_AMOUNT,
    });
  } catch (e) {
    console.error('referrals/me GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
