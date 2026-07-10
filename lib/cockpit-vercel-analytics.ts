import { formatEST } from '@/lib/format-date';

export type AnalyticsPageviewRow = {
  device_id: number | null;
  session_id?: number | null;
  timestamp_ms: number;
};

export type CockpitAnalyticsSummary = {
  pageViews: number;
  /** Sum of unique visitor keys per Eastern calendar day — matches Vercel dashboard Visitors. */
  visitors: number;
  /** Distinct visitor keys across the full range (always lower than visitors for multi-day periods). */
  periodUniqueDevices: number;
  visitorsCapped: boolean;
  /** Earliest pageview timestamp in this query result. */
  dataSinceMs: number | null;
  rowsWithoutVisitorKey: number;
};

function visitorKey(row: AnalyticsPageviewRow): number | null {
  if (row.device_id != null && row.device_id !== 0) return row.device_id;
  const sid = row.session_id;
  if (sid != null && sid !== 0) return sid;
  return null;
}

/**
 * Vercel's dashboard Visitors uses a daily-rotating identity (not one ID for the whole range).
 * Summing unique keys per Eastern day aligns much closer than period-wide DISTINCT device_id.
 */
export function summarizeCockpitAnalytics(
  rows: AnalyticsPageviewRow[],
  capped: boolean
): CockpitAnalyticsSummary {
  const periodDevices = new Set<number>();
  const byDay = new Map<string, Set<number>>();
  let rowsWithoutVisitorKey = 0;

  for (const r of rows) {
    const key = visitorKey(r);
    if (key == null) {
      rowsWithoutVisitorKey += 1;
      continue;
    }
    periodDevices.add(key);
    const day = formatEST(new Date(r.timestamp_ms), 'yyyy-MM-dd');
    let daySet = byDay.get(day);
    if (!daySet) {
      daySet = new Set<number>();
      byDay.set(day, daySet);
    }
    daySet.add(key);
  }

  let visitors = 0;
  for (const daySet of byDay.values()) visitors += daySet.size;

  return {
    pageViews: rows.length,
    visitors,
    periodUniqueDevices: periodDevices.size,
    visitorsCapped: capped,
    dataSinceMs: rows.length > 0 ? Math.min(...rows.map((r) => r.timestamp_ms)) : null,
    rowsWithoutVisitorKey,
  };
}
