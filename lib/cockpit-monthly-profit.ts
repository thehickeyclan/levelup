import { COACH_REVENUE_FRACTION, normalizeCoachRevenueShareRate } from '@/lib/pricing';

export type MonthlyProfitBookingRow = {
  created_at: string | null;
  amount_paid: number | null;
  stripe_fee: number | null;
  session_payout_rate?: number | null;
};

export type CockpitMonthlyGuildNet = {
  month: string;
  gross: number;
  coachPayouts: number;
  stripeFees: number;
  net: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function monthKeyInTimeZone(value: string | Date, timeZone: string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}

function nextMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildCockpitMonthlyGuildNet(
  rows: MonthlyProfitBookingRow[],
  timeZone: string,
  throughDate = new Date()
): CockpitMonthlyGuildNet[] {
  const buckets = new Map<string, CockpitMonthlyGuildNet>();

  for (const row of rows) {
    if (!row.created_at) continue;
    const gross = Number(row.amount_paid ?? 0);
    if (!Number.isFinite(gross) || gross <= 0) continue;
    const month = monthKeyInTimeZone(row.created_at, timeZone);
    if (!month) continue;

    const stripeFeeRaw = Number(row.stripe_fee ?? 0);
    const stripeFee = Number.isFinite(stripeFeeRaw) && stripeFeeRaw > 0 ? stripeFeeRaw : 0;
    const coachRate = normalizeCoachRevenueShareRate(
      row.session_payout_rate ?? COACH_REVENUE_FRACTION
    );
    const coachPayout = round2(gross * coachRate);
    const bucket = buckets.get(month) ?? { month, gross: 0, coachPayouts: 0, stripeFees: 0, net: 0 };
    bucket.gross += gross;
    bucket.coachPayouts += coachPayout;
    bucket.stripeFees += stripeFee;
    buckets.set(month, bucket);
  }

  const firstMonth = [...buckets.keys()].sort()[0];
  const lastMonth = monthKeyInTimeZone(throughDate, timeZone);
  if (!firstMonth || !lastMonth) return [];

  const result: CockpitMonthlyGuildNet[] = [];
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    const bucket = buckets.get(month) ?? { month, gross: 0, coachPayouts: 0, stripeFees: 0, net: 0 };
    result.push({
      month,
      gross: round2(bucket.gross),
      coachPayouts: round2(bucket.coachPayouts),
      stripeFees: round2(bucket.stripeFees),
      net: round2(bucket.gross - bucket.coachPayouts - bucket.stripeFees),
    });
  }
  return result;
}
