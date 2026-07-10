import { isBookingCheckoutShellSession } from '@/lib/session-checkout-shell';

export type WrestlerSpendLine = {
  sessionId: string;
  scheduledDatetime: string;
  amountPaid: number;
};

type SessionParticipantLike = {
  youth_wrestler_id?: string | null;
  amount_paid?: number | null;
  paid?: boolean | null;
};

type SessionLike = {
  id: string;
  status: string;
  parent_id?: string | null;
  athlete_id?: string | null;
  scheduled_datetime: string;
  session_participants?: SessionParticipantLike[] | SessionParticipantLike | null;
};

export function wrestlerAmountPaidFromSession(
  session: SessionLike,
  wrestlerId: string
): number | null {
  const raw = session.session_participants;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const row = rows.find((p) => p.youth_wrestler_id === wrestlerId);
  if (!row) return null;
  if (isBookingCheckoutShellSession(session) && row.paid !== true) return null;
  if (row.paid === false) return null;
  const amt = Math.round(Number(row.amount_paid ?? 0) * 100) / 100;
  return amt > 0 ? amt : null;
}

export function buildWrestlerSpendLines(
  sessions: SessionLike[],
  wrestlerId: string
): WrestlerSpendLine[] {
  const lines: WrestlerSpendLine[] = [];
  for (const session of sessions) {
    const amountPaid = wrestlerAmountPaidFromSession(session, wrestlerId);
    if (amountPaid == null) continue;
    lines.push({
      sessionId: session.id,
      scheduledDatetime: session.scheduled_datetime,
      amountPaid,
    });
  }
  return lines;
}

export type WrestlerSpendSummary = {
  totalSpent: number;
  avgMonthlySpent: number;
  paidSessionCount: number;
  monthsActive: number;
};

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

export function computeWrestlerSpendSummary(lines: WrestlerSpendLine[]): WrestlerSpendSummary {
  if (lines.length === 0) {
    return { totalSpent: 0, avgMonthlySpent: 0, paidSessionCount: 0, monthsActive: 0 };
  }

  const totalSpent = Math.round(lines.reduce((sum, l) => sum + l.amountPaid, 0) * 100) / 100;
  const timestamps = lines
    .map((l) => new Date(l.scheduledDatetime).getTime())
    .filter((t) => !Number.isNaN(t));
  const firstPaid = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const monthsActive = Math.max(1, (Date.now() - firstPaid) / MS_PER_MONTH);
  const avgMonthlySpent = Math.round((totalSpent / monthsActive) * 100) / 100;

  return {
    totalSpent,
    avgMonthlySpent,
    paidSessionCount: lines.length,
    monthsActive: Math.round(monthsActive * 10) / 10,
  };
}

export function formatWrestlerUsd(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
