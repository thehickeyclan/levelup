/**
 * Stripe Connect Express payouts for coaches.
 *
 * Behind STRIPE_CONNECT_ENABLED. Flow:
 *  1. Coach taps "Set up instant payouts" → we create an Express account
 *     (stored on athletes.stripe_account_id) and send them to Stripe onboarding.
 *  2. On return we re-check the account: payouts_enabled → status 'active'.
 *  3. When a session is marked complete and the coach is active, the 85% share
 *     transfers automatically (Transfers API, separate from the parent charge);
 *     athlete_payout_date + stripe_payout_id record it, so the manual admin
 *     queue skips it. Any failure leaves the session in the manual queue.
 *
 * Requires columns (hand-applied SQL):
 *   athletes.stripe_account_id text, athletes.stripe_account_status text,
 *   athletes.stripe_payouts_enabled boolean default false,
 *   sessions.stripe_payout_id text
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coachPayoutUsd } from '@/lib/coach-session-payout';

export function isConnectEnabled(): boolean {
  return process.env.STRIPE_CONNECT_ENABLED === 'true';
}

export type CoachConnectFields = {
  stripe_account_id?: string | null;
  stripe_account_status?: string | null;
  stripe_payouts_enabled?: boolean | null;
};

export function coachHasActivePayouts(athlete: CoachConnectFields | null | undefined): boolean {
  return Boolean(athlete?.stripe_account_id && athlete?.stripe_payouts_enabled);
}

/** Create (or reuse) the coach's Express account and persist its id. */
export async function getOrCreateCoachConnectAccount(
  admin: SupabaseClient,
  stripe: Stripe,
  coach: { id: string; email?: string | null } & CoachConnectFields
): Promise<string> {
  if (coach.stripe_account_id) return coach.stripe_account_id;

  const account = await stripe.accounts.create({
    type: 'express',
    business_type: 'individual',
    email: coach.email || undefined,
    capabilities: { transfers: { requested: true } },
    business_profile: { product_description: 'Private wrestling instruction booked through the platform' },
    metadata: { athlete_id: coach.id },
  });

  const { error } = await admin
    .from('athletes')
    .update({ stripe_account_id: account.id, stripe_account_status: 'onboarding' })
    .eq('id', coach.id);
  if (error) {
    throw new Error(`Could not save Stripe account for coach ${coach.id}: ${error.message}`);
  }
  return account.id;
}

export async function createConnectOnboardingLink(
  stripe: Stripe,
  accountId: string,
  origin: string
): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${origin}/coach-earnings?connect=refresh`,
    return_url: `${origin}/coach-earnings?connect=done`,
  });
  return link.url;
}

/** Re-read the account from Stripe and persist payout readiness. */
export async function syncCoachConnectStatus(
  admin: SupabaseClient,
  stripe: Stripe,
  coachId: string,
  accountId: string
): Promise<{ payoutsEnabled: boolean }> {
  const account = await stripe.accounts.retrieve(accountId);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const status = payoutsEnabled ? 'active' : account.details_submitted ? 'pending' : 'onboarding';
  await admin
    .from('athletes')
    .update({ stripe_payouts_enabled: payoutsEnabled, stripe_account_status: status })
    .eq('id', coachId);
  return { payoutsEnabled };
}

type PayoutSessionRow = {
  id: string;
  athlete_id: string;
  athlete_payment?: number | null;
  athlete_payout_date?: string | null;
  price_per_participant?: number | null;
  current_participants?: number | null;
  session_payout_rate?: number | null;
  session_participants?: { amount_paid?: number | null; paid?: boolean | null }[] | null;
};

/** Coach share in cents for a completed session, from what parents actually paid. */
export function sessionPayoutCents(session: PayoutSessionRow): number {
  const paidSum = (session.session_participants ?? [])
    .filter((p) => p.paid === true)
    .reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);
  if (paidSum <= 0) return 0;
  const usd = coachPayoutUsd({
    athlete_payment: session.athlete_payment,
    price_per_participant: session.price_per_participant,
    current_participants: session.current_participants,
    participant_amount_paid_sum: paidSum,
    session_payout_rate: session.session_payout_rate ?? null,
  });
  return Math.round(usd * 100);
}

/**
 * Transfer the coach share for a just-completed session. Never throws to the
 * caller's success path: on any failure the session simply stays in the manual
 * payout queue (athlete_payout_date null). Returns what happened for logging.
 */
export async function transferCoachPayoutForSession(
  admin: SupabaseClient,
  stripe: Stripe,
  sessionId: string
): Promise<'transferred' | 'skipped' | 'failed'> {
  try {
    if (!isConnectEnabled()) return 'skipped';

    const { data: session } = await admin
      .from('sessions')
      .select(
        'id, athlete_id, athlete_payment, athlete_payout_date, price_per_participant, current_participants, session_payout_rate, session_participants(amount_paid, paid)'
      )
      .eq('id', sessionId)
      .maybeSingle();
    if (!session || session.athlete_payout_date) return 'skipped';

    const row = session as PayoutSessionRow;
    const { data: coach } = await admin
      .from('athletes')
      .select('id, stripe_account_id, stripe_account_status, stripe_payouts_enabled')
      .eq('id', row.athlete_id)
      .maybeSingle();
    if (!coachHasActivePayouts(coach)) return 'skipped';

    const amountCents = sessionPayoutCents(row);
    if (amountCents <= 0) return 'skipped';

    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: 'usd',
        destination: coach!.stripe_account_id as string,
        metadata: { session_id: row.id, athlete_id: row.athlete_id },
      },
      { idempotencyKey: `session-payout-${row.id}` }
    );

    const { error } = await admin
      .from('sessions')
      .update({
        athlete_payment: amountCents / 100,
        athlete_payout_date: new Date().toISOString().slice(0, 10),
        stripe_payout_id: transfer.id,
      })
      .eq('id', row.id)
      .is('athlete_payout_date', null);
    if (error) {
      // Transfer went out but we could not record it; the idempotency key stops
      // a double-send on retry, but surface loudly for the admin ledger.
      console.error(`Connect transfer ${transfer.id} for session ${row.id} not recorded:`, error.message);
      return 'failed';
    }
    return 'transferred';
  } catch (e) {
    console.error(`Connect payout failed for session ${sessionId}; left in manual queue:`, e);
    return 'failed';
  }
}
