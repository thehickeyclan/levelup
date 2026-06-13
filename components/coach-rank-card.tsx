'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trophy, Star, Flame, Medal, DollarSign } from 'lucide-react';
import { formatUsdTwoDecimals } from '@/lib/coach-session-payout';

export type LeaderboardSortMode = 'sessions' | 'earnings' | 'rating';

type CoachStats = {
  id: string;
  name: string;
  sessionCount: number;
  totalEarningsUsd: number;
  averageRating: number | null;
  reviewCount: number;
  thisMonthSessions: number;
  sessionRank: number;
  earningsRank: number;
  ratingRank: number | null;
  isOnFire: boolean;
};

type LeaderboardData = {
  leaderboard: CoachStats[];
  totalCoaches: number;
};

type Props = {
  coachId: string;
  /** When set, show top N coaches by completed sessions under your rank */
  topSessionsListSize?: number;
};

export function CoachRankCard({ coachId, topSessionsListSize }: Props) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<LeaderboardSortMode>('sessions');

  useEffect(() => {
    fetch('/api/coach/leaderboard')
      .then(res => res.json())
      .then((d: LeaderboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const topList = useMemo(() => {
    if (!data || !topSessionsListSize) return [];
    const list = [...data.leaderboard];
    if (sortMode === 'sessions') {
      return list.sort((a, b) => b.sessionCount - a.sessionCount).slice(0, topSessionsListSize);
    }
    if (sortMode === 'earnings') {
      return list.sort((a, b) => b.totalEarningsUsd - a.totalEarningsUsd).slice(0, topSessionsListSize);
    }
    return list
      .filter((c) => c.reviewCount > 0 && c.averageRating != null)
      .sort((a, b) => {
        const br = b.averageRating ?? 0;
        const ar = a.averageRating ?? 0;
        if (br !== ar) return br - ar;
        return b.reviewCount - a.reviewCount;
      })
      .slice(0, topSessionsListSize);
  }, [data, topSessionsListSize, sortMode]);

  if (loading) {
    return (
      <Card className="bg-muted/30 animate-pulse">
        <CardContent className="p-4 h-20" />
      </Card>
    );
  }

  if (!data) return null;

  const myStats = data.leaderboard.find(c => c.id === coachId);
  const totalCoaches = data.totalCoaches;

  if (!myStats && !topSessionsListSize) return null;

  const sessionRank = myStats?.sessionRank ?? null;
  const earningsRank = myStats?.earningsRank ?? null;
  const ratingRank = myStats?.ratingRank ?? null;
  const sessionCount = myStats?.sessionCount ?? 0;
  const totalEarningsUsd = myStats?.totalEarningsUsd ?? 0;
  const isOnFire = myStats?.isOnFire ?? false;
  const averageRating = myStats?.averageRating ?? null;
  const reviewCount = myStats?.reviewCount ?? 0;

  const displayedRank =
    sortMode === 'sessions'
      ? sessionRank
      : sortMode === 'earnings'
        ? earningsRank
        : ratingRank;

  const rankLabel =
    sortMode === 'sessions'
      ? 'by completed bookings'
      : sortMode === 'earnings'
        ? 'by earnings'
        : 'by rating';

  // Determine badges (across all dimensions, not only active filter)
  const badges: { icon: React.ReactNode; label: string; color: string }[] = [];
  
  if (sessionRank === 1 && sessionCount > 0) {
    badges.push({ 
      icon: <Trophy className="h-4 w-4" />, 
      label: 'Most bookings', 
      color: 'bg-accent/20 text-accent border-accent/30' 
    });
  }

  if (earningsRank === 1 && totalEarningsUsd > 0) {
    badges.push({
      icon: <DollarSign className="h-4 w-4" />,
      label: 'Top earnings',
      color: 'bg-accent/20 text-accent border-accent/30',
    });
  }
  
  if (ratingRank === 1 && reviewCount > 0) {
    badges.push({ 
      icon: <Star className="h-4 w-4" />, 
      label: 'Top rated', 
      color: 'bg-accent/20 text-accent border-accent/30' 
    });
  }
  
  if (isOnFire) {
    badges.push({ 
      icon: <Flame className="h-4 w-4" />, 
      label: 'On Fire', 
      color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
    });
  }

  const topListCaption =
    sortMode === 'sessions'
      ? 'Top coaches · bookings (#)'
      : sortMode === 'earnings'
        ? 'Top coaches · earnings ($)'
        : 'Top coaches · rating (stars)';

  return (
    <Card className="border-accent/30 bg-gradient-to-r from-primary to-primary/80">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <label htmlFor="leaderboard-sort" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Leaderboard view
          </label>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as LeaderboardSortMode)}>
            <SelectTrigger id="leaderboard-sort" className="w-full min-h-[44px] touch-manipulation bg-background/80">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sessions">Top bookings (# completed)</SelectItem>
              <SelectItem value="earnings">Top earnings ($)</SelectItem>
              <SelectItem value="rating">Top rated (stars)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {myStats ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Medal className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{`Your rank ${rankLabel}`}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {sortMode === 'rating' && displayedRank === null ? (
                      <span className="text-lg font-semibold">Not ranked yet</span>
                    ) : (
                      <>
                        #{displayedRank}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          {sortMode === 'rating' ? `of ${data.leaderboard.filter((c) => c.reviewCount > 0).length}` : `of ${totalCoaches}`}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sessionCount} completed booking{sessionCount !== 1 ? 's' : ''}
                    {' · '}
                    {`$${formatUsdTwoDecimals(totalEarningsUsd)} earned`}
                    {reviewCount > 0 && averageRating != null
                      ? ` · ${averageRating.toFixed(1)}★ (${reviewCount} review${reviewCount !== 1 ? 's' : ''})`
                      : ''}
                  </p>
                </div>
              </div>

              {badges.length > 0 && (
                <div className="flex flex-col gap-1.5 sm:items-end">
                  {badges.map((badge, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${badge.color}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {averageRating != null && reviewCount > 0 && (
              <div className="pt-3 border-t border-accent/20 flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-accent fill-accent" />
                  <span className="font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({reviewCount} reviews)</span>
                </div>
                {ratingRank != null && (
                  <span className="text-muted-foreground">
                    {`#${ratingRank} by stars`}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your profile isn&apos;t on the public leaderboard yet (inactive or new). Top coaches are listed below.
          </p>
        )}

        {topList.length > 0 && (
          <div className={myStats ? 'pt-4 border-t border-accent/20' : ''}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {topListCaption}
            </p>
            <ul className="space-y-2">
              {topList.map((c, idx) => (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-2 text-sm ${c.id === coachId ? 'font-semibold text-accent' : ''}`}
                >
                  <span className="min-w-0 truncate">
                    <span className="tabular-nums text-muted-foreground mr-2">{idx + 1}.</span>
                    {c.name}
                    {c.id === coachId ? <span className="sr-only"> (you)</span> : null}
                  </span>
                  <span className="tabular-nums shrink-0 text-muted-foreground">
                    {sortMode === 'sessions'
                      ? c.sessionCount
                      : sortMode === 'earnings'
                        ? `$${formatUsdTwoDecimals(c.totalEarningsUsd)}`
                        : c.averageRating != null
                          ? `${c.averageRating.toFixed(1)}★`
                          : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {topSessionsListSize && topList.length === 0 && sortMode === 'rating' ? (
          <p className="text-xs text-muted-foreground">
            No coaches with reviews yet — ratings list will fill in as parents leave reviews.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
