import Link from 'next/link';
import { ChevronRight, DollarSign } from 'lucide-react';
import { formatUsdTwoDecimals } from '@/lib/coach-session-payout';

type Props = {
  thisMonthEarnings: number;
  thisMonthSessionCount: number;
  projectedEarnings: number;
  upcomingSessionCount: number;
};

/** Compact earnings strip at top of coach schedule — links to full Earnings page. */
export function CoachScheduleEarningsSnapshot({
  thisMonthEarnings,
  thisMonthSessionCount,
  projectedEarnings,
  upcomingSessionCount,
}: Props) {
  return (
    <Link
      href="/coach-earnings"
      className="block rounded-xl border border-accent/25 bg-accent/5 p-4 transition-colors hover:border-accent/40 hover:bg-accent/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-accent">
            <DollarSign className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider">This month</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            ${formatUsdTwoDecimals(thisMonthEarnings)}
          </p>
          <p className="text-xs text-muted-foreground">
            {thisMonthSessionCount} completed session{thisMonthSessionCount !== 1 ? 's' : ''}
            {projectedEarnings > 0 ? (
              <>
                {' '}
                · ${formatUsdTwoDecimals(projectedEarnings)} projected from {upcomingSessionCount}{' '}
                upcoming
              </>
            ) : null}
          </p>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-xs font-medium text-accent">View full earnings →</p>
    </Link>
  );
}
