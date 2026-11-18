import { describe, expect, it } from 'vitest';
import { buildPayoutSmsLine } from './twilio';

describe('buildPayoutSmsLine', () => {
  it('builds a prefilled Venmo link for the exact amount, stripping a leading @', () => {
    const line = buildPayoutSmsLine({
      coachName: 'Sabino R',
      payoutUsd: 51,
      venmoHandle: '@Sabino-Wrestling',
      zelleEmail: null,
      autoPaid: false,
    });
    expect(line).toBe(
      'Pay Sabino R $51.00 → https://venmo.com/Sabino-Wrestling?txn=pay&amount=51.00&note=Guild%20session then Mark paid in admin.'
    );
  });

  it('falls back to Zelle when there is no Venmo handle', () => {
    const line = buildPayoutSmsLine({
      coachName: 'Colton',
      payoutUsd: 102,
      venmoHandle: null,
      zelleEmail: 'colton@example.com',
      autoPaid: false,
    });
    expect(line).toBe('Pay Colton $102.00 via Zelle: colton@example.com then Mark paid in admin.');
  });

  it('says auto-paid and nothing else when Connect covers the coach', () => {
    const line = buildPayoutSmsLine({
      coachName: 'Nikolaus',
      payoutUsd: 76.5,
      venmoHandle: '@nik',
      zelleEmail: null,
      autoPaid: true,
    });
    expect(line).toBe('$76.50 auto-pays via Stripe — no action.');
    expect(line).not.toContain('venmo.com');
  });

  it('flags a missing handle instead of inventing a destination', () => {
    const line = buildPayoutSmsLine({
      coachName: 'Cameron',
      payoutUsd: 51,
      venmoHandle: null,
      zelleEmail: null,
      autoPaid: false,
    });
    expect(line).toBe('Owed $51.00 — no payout handle on file for Cameron.');
  });

  it('says nothing is owed when no one paid', () => {
    const line = buildPayoutSmsLine({
      coachName: 'Any',
      payoutUsd: 0,
      venmoHandle: '@any',
      zelleEmail: null,
      autoPaid: false,
    });
    expect(line).toBe('Nothing owed (no paid registrants).');
  });
});
