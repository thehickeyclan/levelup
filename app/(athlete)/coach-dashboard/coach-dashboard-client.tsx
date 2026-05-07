'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { CoachPlaybook } from '@/components/coach-playbook';
import { CoachRankCard } from '@/components/coach-rank-card';
import { formatUsdTwoDecimals } from '@/lib/coach-session-payout';

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  users: { first_name: string } | null;
};

type Props = {
  coachId: string;
  thisMonthEarnings: number;
  allTimeEarnings: number;
  thisMonthSessionCount: number;
  totalPastSessionCount: number;
  payoutRate: number;
  averageRating: number | null;
  reviewCount: number;
  recentReviews: Review[];
  needsOnboarding: boolean;
};

export function CoachDashboardClient({
  coachId,
  thisMonthEarnings,
  allTimeEarnings,
  thisMonthSessionCount,
  totalPastSessionCount,
  payoutRate,
  averageRating,
  reviewCount,
  recentReviews,
  needsOnboarding,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">
            Earnings, reviews, and growth — not your day-to-day schedule.
          </p>
        </div>
        <Link
          href="/athlete-dashboard"
          className="text-sm font-semibold text-[#D4AF37] hover:underline whitespace-nowrap"
        >
          ← Schedule
        </Link>
      </div>

      <section aria-label="Earnings summary">
        <h2 className="text-sm font-semibold text-foreground mb-3">Earnings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">This month</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">${formatUsdTwoDecimals(thisMonthEarnings)}</p>
              <p className="text-xs text-muted-foreground">
                {thisMonthSessionCount} completed session{thisMonthSessionCount !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">All time</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">${formatUsdTwoDecimals(allTimeEarnings)}</p>
              <p className="text-xs text-muted-foreground">
                {totalPastSessionCount} session{totalPastSessionCount !== 1 ? 's' : ''} in history
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="mt-3">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Your payout rate</p>
              <p className="text-lg font-semibold text-foreground">
                {Math.round(payoutRate * 100)}%
                {payoutRate >= 0.9 && (
                  <span className="ml-2 text-xs text-[#D4AF37] font-medium">(Founding Coach)</span>
                )}
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-[44px] touch-manipulation shrink-0">
              <Link href="/coach-earnings">Full earnings &amp; history →</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <CoachRankCard coachId={coachId} />

      <section aria-label="Recent reviews">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Recent reviews</h2>
          {reviewCount > 0 && (
            <Link href="/coach-reviews" className="text-sm text-accent font-medium">
              View all →
            </Link>
          )}
        </div>
        {reviewCount === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Star className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No reviews yet. They&apos;ll show up after completed sessions.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 space-y-3">
              {recentReviews.map((review) => (
                <div key={review.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${i < review.rating ? 'fill-[#D4AF37] text-[#D4AF37]' : 'text-muted-foreground/30'}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{review.users?.first_name ?? 'Parent'}</span>
                  </div>
                  {review.comment && <p className="text-sm text-muted-foreground line-clamp-3">{review.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-label="Rating summary">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Average rating</p>
              <p className="text-2xl font-bold tabular-nums">
                {averageRating != null ? averageRating.toFixed(1) : '—'}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <CoachPlaybook />

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

      <p className="text-center text-sm text-muted-foreground pb-4">
        <Link href="/profile" className="text-accent font-medium underline">
          Profile &amp; public page
        </Link>
        {' · '}
        <Link href="/availability" className="text-accent font-medium underline">
          Availability
        </Link>
        {' · '}
        <Link href="/coach-roster" className="text-accent font-medium underline">
          Families &amp; contacts
        </Link>
        {' · '}
        <Link href="/coach-help" className="text-accent font-medium underline">
          Coach help
        </Link>
      </p>
    </div>
  );
}
