import { describe, expect, it } from 'vitest';
import {
  buildWrestlerSpendLines,
  computeWrestlerSpendSummary,
  wrestlerAmountPaidFromSession,
} from './wrestler-spend-stats';

const WRESTLER_ID = 'w1';

describe('wrestler-spend-stats', () => {
  it('skips unpaid checkout shell rows', () => {
    const session = {
      id: 's1',
      status: 'scheduled',
      parent_id: 'parent-1',
      athlete_id: 'coach-1',
      scheduled_datetime: '2026-01-15T10:00:00Z',
      session_participants: [{ youth_wrestler_id: WRESTLER_ID, amount_paid: 50, paid: false }],
    };
    expect(wrestlerAmountPaidFromSession(session, WRESTLER_ID)).toBeNull();
  });

  it('sums paid lines and computes average monthly spend', () => {
    const sessions = [
      {
        id: 's1',
        status: 'completed',
        parent_id: 'coach-1',
        athlete_id: 'coach-1',
        scheduled_datetime: '2026-01-01T10:00:00Z',
        session_participants: [{ youth_wrestler_id: WRESTLER_ID, amount_paid: 100, paid: true }],
      },
      {
        id: 's2',
        status: 'completed',
        parent_id: 'coach-1',
        athlete_id: 'coach-1',
        scheduled_datetime: '2026-02-01T10:00:00Z',
        session_participants: [{ youth_wrestler_id: WRESTLER_ID, amount_paid: 50, paid: true }],
      },
    ];
    const lines = buildWrestlerSpendLines(sessions, WRESTLER_ID);
    const summary = computeWrestlerSpendSummary(lines);
    expect(summary.totalSpent).toBe(150);
    expect(summary.paidSessionCount).toBe(2);
    expect(summary.avgMonthlySpent).toBeGreaterThan(0);
  });
});
