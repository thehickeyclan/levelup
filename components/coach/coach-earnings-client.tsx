'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CoachPlaybook } from '@/components/coach-playbook';
import { CoachRankCard } from '@/components/coach-rank-card';
import { formatUsdTwoDecimals } from '@/lib/coach-session-payout';
import { coachPayoutDisplayStatus, coachPayoutStatusLabel, participantAmountPaidSum } from '@/lib/coach-payout-status';
import { formatEST } from '@/lib/format-date';
import { coachRevenueSharePercentDisplay } from '@/lib/pricing';
import { Clock, DollarSign, Star, TrendingUp } from 'lucide-react';

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  users: { first_name: string } | null;
};

type EarningsSession = {
  id: string;
  scheduled_datetime: string | null;
  session_type?: string | null;
  current_participants?: number | null;
  payout: number;
  payout_status?: 'paid' | 'payout_pending' | 'awaiting_parent_payment' | 'not_completed';
};

type Props = {
  coachId: string;
  payoutRate: number;
  thisMonthEarnings: number;
  allTimeEarnings: number;
  projectedEarnings: number;
  upcomingSessionCount: number;
  thisMonthSessionCount: number;
  totalPastSessionCount: number;
  pendingPayoutAmount?: number;
  pendingPayoutSessionCount?: number;
  averageRating: number | null;
  reviewCount: number;
  recentReviews: Review[];
  earningsSessions: EarningsSession[];
  needsOnboarding: boolean;
  adminPickCoachHint?: boolean;
  showLeaderboard?: boolean;
};

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
      {children}
    </h2>
  );
}

function SectionDivider({ children }: { children: ReactNode }) {
  return <section className="border-t border-border pt-8">{children}</section>;
}

export function CoachEarningsClient({
  coachId,
  payoutRate,
  thisMonthEarnings,
  allTimeEarnings,
  projectedEarnings,
  upcomingSessionCount,
  thisMonthSessionCount,
  totalPastSessionCount,
  averageRating,
  reviewCount,
  recentReviews,
  earningsSessions,
  needsOnboarding,
  adminPickCoachHint = false,
  showLeaderboard = true,
  pendingPayoutAmount = 0,
  pendingPayoutSessionCount = 0,
}: Props) {
  const payoutPercentDisplay = coachRevenueSharePercentDisplay(
    payoutRate !== 0.8 ? payoutRate : null
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Earnings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Money, session history, reviews, and growth — all in one place.
          </p>
        </div>
        <Link
          href="/athlete-dashboard"
          className="text-sm font-semibold text-accent hover:underline whitespace-nowrap shrink-0"
        >
          ← Schedule
        </Link>
      </header>

      {adminPickCoachHint && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          Choose a coach in the header to see their earnings. You&apos;re signed in as admin.
        </p>
      )}

      {needsOnboarding && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-50">
          <p className="font-medium">Finish your coach profile</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
            Add a short bio and a few details so parents can book you.
          </p>
          <Button asChild className="mt-3 bg-amber-600 hover:bg-amber-700 text-black" size="sm">
            <Link href="/onboarding">Continue setup</Link>
          </Button>
        </div>
      )}

      {/* 1. Summary */}
      <section aria-label="Earnings summary">
        <SectionHeading>Summary</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" aria-hidden />
                <span className="text-sm">This month</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                ${formatUsdTwoDecimals(thisMonthEarnings)}
              </p>
              <p className="text-xs text-muted-foreground">
                {thisMonthSessionCount} completed session{thisMonthSessionCount !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" aria-hidden />
                <span className="text-sm">All time</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                ${formatUsdTwoDecimals(allTimeEarnings)}
              </p>
              <p className="text-xs text-muted-foreground">
                {totalPastSessionCount} session{totalPastSessionCount !== 1 ? 's' : ''} in history
              </p>
            </CardContent>
          </Card>
          <Card className={projectedEarnings > 0 ? 'border-accent/30 bg-accent/5' : undefined}>
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 text-accent" aria-hidden />
                <span className="text-sm">Projected</span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                ${formatUsdTwoDecimals(projectedEarnings)}
              </p>
              <p className="text-xs text-muted-foreground">
                {upcomingSessionCount} upcoming session{upcomingSessionCount !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You earn{' '}
          <span className="font-medium text-foreground">{payoutPercentDisplay}%</span>
          of each session&apos;s total price
          {payoutRate >= 0.9 ? (
            <span className="ml-1 font-medium text-accent">(Founding Coach)</span>
          ) : null}
          .
        </p>
        {pendingPayoutSessionCount > 0 ? (
          <Card className="mt-3 border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 p-4">
              <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">Payout pending</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  ${formatUsdTwoDecimals(pendingPayoutAmount)} from {pendingPayoutSessionCount} completed session
                  {pendingPayoutSessionCount !== 1 ? 's' : ''} — parents already paid to register; Guild sends your
                  share on the usual payout schedule.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* 2. Session history */}
      <SectionDivider>
        <SectionHeading>Session history</SectionHeading>
        {earningsSessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No paid sessions yet. Completed bookings appear here with your payout per session.
              </p>
              <Button asChild variant="outline" className="mt-4 min-h-[44px]">
                <Link href="/coach-sessions/create">Create a session</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {earningsSessions.slice(0, 15).map((session) => (
              <Card key={session.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {session.scheduled_datetime
                        ? formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d, yyyy')
                        : 'Session'}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {session.session_type?.replace(/_/g, ' ') ?? 'Session'} ·{' '}
                      {session.current_participants ?? 1} athlete
                      {(session.current_participants ?? 1) !== 1 ? 's' : ''}
                      {session.payout_status && session.payout_status !== 'not_completed'
                        ? ` · ${coachPayoutStatusLabel(session.payout_status)}`
                        : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold tabular-nums text-emerald-500">
                    +${formatUsdTwoDecimals(session.payout)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </SectionDivider>

      {/* 3. Reviews */}
      <SectionDivider>
        <div className="mb-4 flex items-center justify-between gap-2">
          <SectionHeading>Reviews</SectionHeading>
          {reviewCount > 0 && (
            <Link href="/coach-reviews" className="text-sm font-medium text-accent hover:underline">
              View all →
            </Link>
          )}
        </div>
        <Card className="mb-4">
          <CardContent className="flex items-center gap-3 p-4">
            <Star className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Average rating</p>
              <p className="text-2xl font-bold tabular-nums">
                {averageRating != null ? averageRating.toFixed(1) : '—'}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        {reviewCount === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No reviews yet. They appear after parents complete sessions.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-4">
              {recentReviews.map((review) => (
                <div key={review.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${i < review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {review.users?.first_name ?? 'Parent'}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{review.comment}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </SectionDivider>

      {/* 4. Leaderboard */}
      {showLeaderboard && (
        <SectionDivider>
          <SectionHeading>Leaderboard</SectionHeading>
          <CoachRankCard coachId={coachId} topSessionsListSize={5} />
        </SectionDivider>
      )}

      {/* 5. Playbook */}
      <SectionDivider>
        <SectionHeading>Coach playbook</SectionHeading>
        <CoachPlaybook />
      </SectionDivider>

      <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <Link href="/profile" className="font-medium text-accent hover:underline">
          Profile
        </Link>
        {' · '}
        <Link href="/availability" className="font-medium text-accent hover:underline">
          Availability
        </Link>
        {' · '}
        <Link href="/coach-roster" className="font-medium text-accent hover:underline">
          Families
        </Link>
        {' · '}
        <Link href="/coach-help" className="font-medium text-accent hover:underline">
          Help
        </Link>
      </footer>
    </div>
  );
}
