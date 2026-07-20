import { describe, expect, it } from 'vitest';
import { buildCockpitMonthlyGuildNet } from './cockpit-monthly-profit';

describe('buildCockpitMonthlyGuildNet', () => {
  it('groups paid bookings by month and uses the standard coach share', () => {
    const result = buildCockpitMonthlyGuildNet(
      [
        { created_at: '2026-01-10T15:00:00Z', amount_paid: 100, stripe_fee: 3.2 },
        { created_at: '2026-01-20T15:00:00Z', amount_paid: 50, stripe_fee: 1.75 },
        { created_at: '2026-03-03T15:00:00Z', amount_paid: 200, stripe_fee: 6.1 },
      ],
      'America/New_York',
      new Date('2026-03-20T12:00:00Z')
    );

    expect(result).toEqual([
      { month: '2026-01', gross: 150, coachPayouts: 120, stripeFees: 4.95, net: 25.05 },
      { month: '2026-02', gross: 0, coachPayouts: 0, stripeFees: 0, net: 0 },
      { month: '2026-03', gross: 200, coachPayouts: 160, stripeFees: 6.1, net: 33.9 },
    ]);
  });

  it('enforces the standard 80% coach share and ignores unpaid rows', () => {
    const result = buildCockpitMonthlyGuildNet(
      [
        { created_at: '2026-05-01T12:00:00Z', amount_paid: 100, stripe_fee: 3, session_payout_rate: 0.75 },
        { created_at: '2026-05-02T12:00:00Z', amount_paid: 0, stripe_fee: 0, session_payout_rate: 0.8 },
      ],
      'America/New_York',
      new Date('2026-05-20T12:00:00Z')
    );

    expect(result).toEqual([
      { month: '2026-05', gross: 100, coachPayouts: 80, stripeFees: 3, net: 17 },
    ]);
  });
});
