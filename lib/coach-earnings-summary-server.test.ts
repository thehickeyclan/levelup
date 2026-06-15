import { describe, it, expect } from 'vitest';
import {
  coachEarningsMonthKey,
  isCoachSessionInEarningsMonth,
  summarizeCoachEarningsFromPastSessions,
  type CoachEarningsSessionRow,
} from './coach-earnings-summary-server';

function session(partial: Partial<CoachEarningsSessionRow>): CoachEarningsSessionRow {
  return {
    id: 's1',
    scheduled_datetime: '2026-05-15T15:00:00.000Z',
    status: 'completed',
    session_participants: [],
    ...partial,
  };
}

describe('coachEarningsMonthKey', () => {
  it('uses completed_at for completed sessions (not scheduled month)', () => {
    const s = session({
      scheduled_datetime: '2026-05-15T15:00:00.000Z',
      completed_at: '2026-06-02T14:00:00.000Z',
      status: 'completed',
    });
    expect(coachEarningsMonthKey(s)).toBe('2026-06');
  });

  it('falls back to scheduled_datetime when completed_at is missing', () => {
    const s = session({
      scheduled_datetime: '2026-06-14T15:30:00.000Z',
      completed_at: null,
      status: 'completed',
    });
    expect(coachEarningsMonthKey(s)).toBe('2026-06');
  });

  it('uses scheduled_datetime for past scheduled sessions', () => {
    const s = session({
      scheduled_datetime: '2026-06-10T15:00:00.000Z',
      status: 'scheduled',
    });
    expect(coachEarningsMonthKey(s)).toBe('2026-06');
  });
});

describe('summarizeCoachEarningsFromPastSessions this month', () => {
  it('includes completed sessions in the month they were closed out', () => {
    const rows = [
      session({
        id: 'may-sched-june-complete',
        scheduled_datetime: '2026-05-20T15:00:00.000Z',
        completed_at: '2026-06-13T18:00:00.000Z',
        status: 'completed',
        athlete_payment: 72,
      }),
    ];

    const summary = summarizeCoachEarningsFromPastSessions(
      rows,
      0.8,
      '2026-06-13T20:00:00.000Z'
    );

    expect(summary.thisMonthSessions).toHaveLength(1);
    expect(summary.thisMonthEarnings).toBe(72);
    expect(summary.allTimeEarnings).toBe(72);
  });

  it('excludes sessions completed in a prior month', () => {
    const rows = [
      session({
        scheduled_datetime: '2026-05-20T15:00:00.000Z',
        completed_at: '2026-05-25T18:00:00.000Z',
        status: 'completed',
        athlete_payment: 72,
      }),
    ];

    const summary = summarizeCoachEarningsFromPastSessions(
      rows,
      0.8,
      '2026-06-13T20:00:00.000Z'
    );

    expect(summary.thisMonthSessions).toHaveLength(0);
    expect(summary.thisMonthEarnings).toBe(0);
    expect(summary.allTimeEarnings).toBe(72);
  });

  it('matches isCoachSessionInEarningsMonth helper', () => {
    const s = session({
      completed_at: '2026-06-13T18:00:00.000Z',
      status: 'completed',
    });
    expect(isCoachSessionInEarningsMonth(s, '2026-06')).toBe(true);
    expect(isCoachSessionInEarningsMonth(s, '2026-05')).toBe(false);
  });
});
