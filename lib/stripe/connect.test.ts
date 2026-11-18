import { describe, expect, it } from 'vitest';
import { coachHasActivePayouts, sessionPayoutCents } from './connect';

describe('sessionPayoutCents', () => {
  it('pays 85% of what parents actually paid, ignoring unpaid roster holds', () => {
    const cents = sessionPayoutCents({
      id: 's1',
      athlete_id: 'c1',
      session_participants: [
        { amount_paid: 60, paid: true },
        { amount_paid: 60, paid: false }, // hold never checked out
      ],
    });
    // 60 × 0.85 = 51.00
    expect(cents).toBe(5100);
  });

  it('uses a recorded athlete_payment verbatim when set', () => {
    const cents = sessionPayoutCents({
      id: 's2',
      athlete_id: 'c1',
      athlete_payment: 72,
      session_participants: [{ amount_paid: 90, paid: true }],
    });
    expect(cents).toBe(7200);
  });

  it('pays nothing when no participant has paid, even with a list price', () => {
    const cents = sessionPayoutCents({
      id: 's3',
      athlete_id: 'c1',
      price_per_participant: 60,
      current_participants: 2,
      session_participants: [{ amount_paid: 0, paid: false }],
    });
    expect(cents).toBe(0);
  });

  it('rounds the group share to whole cents', () => {
    const cents = sessionPayoutCents({
      id: 's4',
      athlete_id: 'c1',
      session_participants: [
        { amount_paid: 35, paid: true },
        { amount_paid: 35, paid: true },
        { amount_paid: 35.5, paid: true },
      ],
    });
    // 105.50 × 0.85 = 89.675 → coachPayoutUsd rounds to 89.68 → 8968
    expect(cents).toBe(8968);
  });
});

describe('coachHasActivePayouts', () => {
  it('requires both a Stripe account and payouts enabled', () => {
    expect(coachHasActivePayouts({ stripe_account_id: 'acct_1', stripe_payouts_enabled: true })).toBe(true);
    expect(coachHasActivePayouts({ stripe_account_id: 'acct_1', stripe_payouts_enabled: false })).toBe(false);
    expect(coachHasActivePayouts({ stripe_account_id: null, stripe_payouts_enabled: true })).toBe(false);
    expect(coachHasActivePayouts(null)).toBe(false);
  });
});
