/**
 * Bucket Supabase rows by cockpit trend ranges in-process (one query per table, not one per bucket).
 */

export type TrendRange = { start: string; end: string; label?: string };

function rangeBounds(ranges: TrendRange[]): { start: number; end: number }[] {
  return ranges.map((r) => ({
    start: new Date(r.start).getTime(),
    end: new Date(r.end).getTime(),
  }));
}

/** Count rows whose timestamp falls in each range bucket. */
export function bucketCountsByRanges(
  timestamps: (string | null | undefined)[],
  ranges: TrendRange[]
): number[] {
  if (ranges.length === 0) return [];
  const bounds = rangeBounds(ranges);
  const counts = ranges.map(() => 0);
  for (const ts of timestamps) {
    if (ts == null) continue;
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) continue;
    for (let i = 0; i < bounds.length; i++) {
      if (t >= bounds[i].start && t <= bounds[i].end) {
        counts[i] += 1;
        break;
      }
    }
  }
  return counts;
}

/** Count rows with created_at <= each bucket end (cumulative platform growth). */
export function cumulativeCountsAtRangeEnds(
  timestamps: (string | null | undefined)[],
  ranges: TrendRange[],
  nullTimestampCount = 0
): number[] {
  if (ranges.length === 0) return [];
  const dated = timestamps
    .filter((ts): ts is string => ts != null)
    .map((ts) => new Date(ts).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  return ranges.map(({ end }) => {
    const tEnd = new Date(end).getTime();
    let lo = 0;
    let hi = dated.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dated[mid] <= tEnd) lo = mid + 1;
      else hi = mid;
    }
    return lo + nullTimestampCount;
  });
}

/** Sum amount_paid per bucket from rows already loaded for the trend window. */
export function bucketSumAmountPaidByRanges(
  rows: { amount_paid?: number | null; created_at: string | null }[],
  ranges: TrendRange[]
): number[] {
  if (ranges.length === 0) return [];
  const bounds = rangeBounds(ranges);
  const sums = ranges.map(() => 0);
  for (const r of rows) {
    if (r.created_at == null) continue;
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const amt = Number(r.amount_paid ?? 0);
    for (let i = 0; i < bounds.length; i++) {
      if (t >= bounds[i].start && t <= bounds[i].end) {
        sums[i] += amt;
        break;
      }
    }
  }
  return sums.map((n) => Math.round(n * 100) / 100);
}

/** Cumulative gross booking $ at each bucket end. */
export function cumulativeAmountPaidAtRangeEnds(
  rows: { amount_paid?: number | null; created_at: string | null }[],
  ranges: TrendRange[]
): number[] {
  if (ranges.length === 0) return [];
  return ranges.map(({ end }) => {
    const tEnd = new Date(end).getTime();
    let s = 0;
    for (const r of rows) {
      if (r.created_at == null) {
        s += Number(r.amount_paid ?? 0);
        continue;
      }
      const t = new Date(r.created_at).getTime();
      if (!Number.isNaN(t) && t <= tEnd) s += Number(r.amount_paid ?? 0);
    }
    return Math.round(s * 100) / 100;
  });
}
