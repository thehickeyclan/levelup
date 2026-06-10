/**
 * Cockpit KPI + trend date ranges — all calendar math in Eastern (America/New_York).
 */
import {
  addDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfMonth,
} from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { APP_TIMEZONE } from '@/lib/format-date';

export type CockpitPeriod = 'today' | 'week' | 'month' | '90d' | 'year';

export type TrendBucket = { start: string; end: string; label: string };

export type CockpitRangeResult = {
  period: CockpitPeriod;
  anchorDate: string;
  rangeStart: string;
  rangeEnd: string;
  dayStart: string;
  dayEnd: string;
  trendRanges: TrendBucket[];
};

/** Current calendar date as YYYY-MM-DD in the given timezone. */
export function todayYmdInTz(tz: string = APP_TIMEZONE): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/** Given a date YYYY-MM-DD in Eastern, return ISO range for that calendar day (for DB queries). */
export function dayRangeInTz(dateStr: string, tz: string = APP_TIMEZONE): { start: string; end: string } {
  const ref = new Date(dateStr + 'T12:00:00.000Z');
  const zoned = toZonedTime(ref, tz);
  const startZoned = startOfDay(zoned);
  const endZoned = endOfDay(zoned);
  const startUTC = fromZonedTime(startZoned, tz);
  const endUTC = fromZonedTime(endZoned, tz);
  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
  };
}

function anchorZoned(anchorYmd: string, tz: string): Date {
  return toZonedTime(new Date(anchorYmd + 'T12:00:00.000Z'), tz);
}

function ymdFromZoned(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, 'yyyy-MM-dd');
}

function addDaysYmd(ymd: string, days: number, tz: string): string {
  const zoned = anchorZoned(ymd, tz);
  return ymdFromZoned(addDays(zoned, days), tz);
}

function eachDayYmd(startYmd: string, endYmd: string, tz: string): string[] {
  const out: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1, tz);
  }
  return out;
}

function dailyTrendBuckets(days: string[], tz: string): TrendBucket[] {
  return days.map((ds) => {
    const { start, end } = dayRangeInTz(ds, tz);
    const label = formatInTimeZone(new Date(ds + 'T12:00:00.000Z'), tz, 'M/d');
    return { start, end, label };
  });
}

function monthlyTrendBucketsYtd(anchorYmd: string, tz: string): TrendBucket[] {
  const zoned = anchorZoned(anchorYmd, tz);
  const year = parseInt(formatInTimeZone(zoned, tz, 'yyyy'), 10);
  const anchorMonth = parseInt(formatInTimeZone(zoned, tz, 'M'), 10);
  const buckets: TrendBucket[] = [];

  for (let mon = 1; mon <= anchorMonth; mon++) {
    const firstDay = `${year}-${String(mon).padStart(2, '0')}-01`;
    const monthStart = anchorZoned(firstDay, tz);
    const lastDay =
      mon === anchorMonth
        ? anchorYmd
        : ymdFromZoned(endOfMonth(monthStart), tz);
    const startRange = dayRangeInTz(firstDay, tz);
    const endRange = dayRangeInTz(lastDay, tz);
    const label = formatInTimeZone(monthStart, tz, 'MMM yy');
    buckets.push({
      start: startRange.start,
      end: endRange.end,
      label,
    });
  }
  return buckets;
}

export function parseCockpitPeriod(
  periodParam: string | null,
  rangeParam: string | null,
  trendParam: string | null
): CockpitPeriod {
  if (
    periodParam === 'today' ||
    periodParam === 'week' ||
    periodParam === 'month' ||
    periodParam === '90d' ||
    periodParam === 'year'
  ) {
    return periodParam;
  }
  // Legacy query params (range + trendPeriod)
  if (trendParam === '90d') return '90d';
  if (trendParam === '12m') return 'year';
  if (rangeParam === 'week') return 'week';
  if (rangeParam === 'month') return 'month';
  return 'today';
}

/** Resolve KPI window and trend chart buckets for a cockpit period. */
export function resolveCockpitRange(
  period: CockpitPeriod,
  anchorYmd: string,
  tz: string = APP_TIMEZONE
): CockpitRangeResult {
  const zoned = anchorZoned(anchorYmd, tz);
  let rangeStart = anchorYmd;
  let rangeEnd = anchorYmd;
  let trendRanges: TrendBucket[] = [];

  switch (period) {
    case 'today': {
      rangeStart = anchorYmd;
      rangeEnd = anchorYmd;
      trendRanges = dailyTrendBuckets([anchorYmd], tz);
      break;
    }
    case 'week': {
      const weekStart = startOfWeek(zoned, { weekStartsOn: 0 });
      rangeStart = ymdFromZoned(weekStart, tz);
      rangeEnd = anchorYmd;
      trendRanges = dailyTrendBuckets(eachDayYmd(rangeStart, rangeEnd, tz), tz);
      break;
    }
    case 'month': {
      rangeStart = ymdFromZoned(startOfMonth(zoned), tz);
      rangeEnd = anchorYmd;
      trendRanges = dailyTrendBuckets(eachDayYmd(rangeStart, rangeEnd, tz), tz);
      break;
    }
    case '90d': {
      rangeStart = addDaysYmd(anchorYmd, -89, tz);
      rangeEnd = anchorYmd;
      trendRanges = dailyTrendBuckets(eachDayYmd(rangeStart, rangeEnd, tz), tz);
      break;
    }
    case 'year': {
      rangeStart = ymdFromZoned(startOfYear(zoned), tz);
      rangeEnd = anchorYmd;
      trendRanges = monthlyTrendBucketsYtd(anchorYmd, tz);
      break;
    }
  }

  const rangeStartBounds = dayRangeInTz(rangeStart, tz);
  const rangeEndBounds = dayRangeInTz(rangeEnd, tz);

  return {
    period,
    anchorDate: anchorYmd,
    rangeStart,
    rangeEnd,
    dayStart: rangeStartBounds.start,
    dayEnd: rangeEndBounds.end,
    trendRanges,
  };
}

export function cockpitPeriodLabel(period: CockpitPeriod): string {
  switch (period) {
    case 'today':
      return 'Today';
    case 'week':
      return 'This Week';
    case 'month':
      return 'This Month';
    case '90d':
      return '90 Days';
    case 'year':
      return 'This Year';
  }
}
