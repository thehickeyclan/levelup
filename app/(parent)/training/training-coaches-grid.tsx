'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarGrid } from '@/components/ui/calendar';
import { Calendar, Heart, SlidersHorizontal } from 'lucide-react';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import { StarRating } from '@/components/star-rating';
import { APP_TIMEZONE, formatEST } from '@/lib/format-date';
import { fromZonedTime } from 'date-fns-tz';
import { cn } from '@/lib/utils';
import {
  coachIdsMatchingDateFilter,
  type CoachDateFilterData,
  type CoachSessionTypeFilter,
} from '@/lib/training-coach-date-filter';
import type { Athlete } from '@/types';
import { useAuth } from '@/lib/auth/use-auth';

export type { CoachSessionTypeFilter as SessionTypeFilter };

const SESSION_TYPE_PILLS: { value: CoachSessionTypeFilter; label: string; labelShort?: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'small_group', label: 'Small group', labelShort: 'Group' },
  { value: 'private', label: 'Private' },
  { value: 'partner', label: 'Partner' },
  { value: 'partner_private', label: 'Partner / Private', labelShort: 'P / P' },
];

export interface AthleteWithNext extends Athlete {
  nextAvailable?: { slot_date: string; start_time: string } | null;
}

type Props = {
  athletes: AthleteWithNext[];
  serviceTypesByCoach: Record<string, string[]>;
  coachIdsWithOpen: string[];
  preselectedWrestlerId?: string;
  locationFacilities: Array<{ id: string; name: string }>;
  coachIdsByFacilityId: Record<string, string[]>;
  coachDateFilterData: CoachDateFilterData;
  coachDateFilterBounds: { minYmd: string; maxYmd: string };
  initialSessionType?: CoachSessionTypeFilter;
  initialFollowedCoachIds?: string[];
  /** Matches `?location=` on `/training`; must be `all` or an id present in locationFacilities. */
  initialFacilityId?: string;
};

/** Eastern wall time so mobile Safari never treats the calendar day as local TZ. */
function formatCoachNextLine(slot_date: string, start_time: string): string {
  const ymd = slot_date.split('T')[0];
  const raw = (start_time || '12:00').trim();
  const parts = raw.split(':');
  const hh = Math.min(23, Math.max(0, parseInt(parts[0] ?? '12', 10) || 12));
  const mm = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10) || 0));
  const ss =
    parts[2] != null && parts[2] !== ''
      ? Math.min(59, Math.max(0, parseInt(parts[2], 10) || 0))
      : 0;
  const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const instant = fromZonedTime(`${ymd}T${t}`, APP_TIMEZONE);
  return `Next: ${formatEST(instant, 'EEE MMM d')}`;
}

export function TrainingCoachesGrid({
  athletes,
  serviceTypesByCoach,
  coachIdsWithOpen,
  preselectedWrestlerId = '',
  locationFacilities,
  coachIdsByFacilityId,
  coachDateFilterData,
  coachDateFilterBounds,
  initialSessionType = 'all',
  initialFollowedCoachIds = [],
  initialFacilityId = 'all',
}: Props) {
  const { user, userRole } = useAuth();
  const [dateOpen, setDateOpen] = useState(false);
  const [followedCoachIds, setFollowedCoachIds] = useState<Set<string>>(
    () => new Set(initialFollowedCoachIds)
  );
  const resolvedInitialFacility =
    initialFacilityId && initialFacilityId !== 'all' && coachIdsByFacilityId[initialFacilityId]
      ? initialFacilityId
      : 'all';
  const [facilityId, setFacilityId] = useState<string>(resolvedInitialFacility);
  const [sessionType, setSessionType] = useState<CoachSessionTypeFilter>(initialSessionType);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSessionType(initialSessionType);
  }, [initialSessionType]);

  useEffect(() => {
    const next =
      initialFacilityId && initialFacilityId !== 'all' && coachIdsByFacilityId[initialFacilityId]
        ? initialFacilityId
        : 'all';
    setFacilityId(next);
  }, [initialFacilityId, coachIdsByFacilityId]);

  useEffect(() => {
    if (!user || (userRole !== 'parent' && userRole !== 'admin')) return;
    fetch('/api/coach-follows')
      .then((r) => r.json())
      .then((d) => {
        if (d.follows) {
          setFollowedCoachIds(new Set(d.follows.map((f: { coachId: string }) => f.coachId)));
        }
      })
      .catch(() => {});
  }, [user, userRole]);

  const allCoachIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  const dateCoachSet = useMemo(
    () =>
      coachIdsMatchingDateFilter(
        filterDate || null,
        sessionType,
        coachDateFilterData,
        allCoachIds
      ),
    [filterDate, sessionType, coachDateFilterData, allCoachIds]
  );

  const filtered = useMemo(() => {
    const allowedByLocation =
      facilityId === 'all'
        ? null
        : new Set(coachIdsByFacilityId[facilityId] ?? []);

    return athletes.filter((a) => {
      if (allowedByLocation && !allowedByLocation.has(a.id)) return false;
      if (sessionType !== 'all') {
        const types = serviceTypesByCoach[a.id] ?? [];
        if (sessionType === 'small_group') {
          if (!types.includes('small_group')) return false;
        } else if (sessionType === 'private') {
          if (!types.includes('private')) return false;
        } else if (sessionType === 'partner') {
          if (!types.includes('partner')) return false;
        } else if (sessionType === 'partner_private') {
          if (!types.includes('partner') && !types.includes('private')) return false;
        }
      }
      if (availableOnly && !coachIdsWithOpen.includes(a.id)) return false;
      if (dateCoachSet && !dateCoachSet.has(a.id)) return false;
      return true;
    });
  }, [
    athletes,
    facilityId,
    sessionType,
    availableOnly,
    serviceTypesByCoach,
    coachIdsWithOpen,
    coachIdsByFacilityId,
    dateCoachSet,
  ]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const af = followedCoachIds.has(a.id);
      const bf = followedCoachIds.has(b.id);
      if (af && !bf) return -1;
      if (!af && bf) return 1;
      const ar = a.average_rating ?? 0;
      const br = b.average_rating ?? 0;
      if (br !== ar) return br - ar;
      const rc = (b.review_count ?? 0) - (a.review_count ?? 0);
      if (rc !== 0) return rc;
      return a.id.localeCompare(b.id);
    });
    return copy;
  }, [filtered, followedCoachIds]);

  const profileHref = (id: string) =>
    preselectedWrestlerId
      ? `/athlete/${id}?youthWrestlerId=${encodeURIComponent(preselectedWrestlerId)}`
      : `/athlete/${id}`;

  const showDateEmpty = Boolean(filterDate) && sorted.length === 0;

  const filtersActive =
    Boolean(filterDate) ||
    facilityId !== 'all' ||
    sessionType !== 'all' ||
    availableOnly;

  const clearAllFilters = () => {
    setFilterDate('');
    setDateOpen(false);
    setFacilityId('all');
    setSessionType('all');
    setAvailableOnly(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">Choose a coach to request training</p>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex min-h-11 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-300"
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters{filtersActive ? ' · On' : ''}
        </button>
      </div>
      {filtersOpen && <div className="-mx-1 sm:mx-0">
        <div
          className="flex snap-x snap-mandatory items-center gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
          role="toolbar"
          aria-label="Coach filters"
        >
        <div
          className={cn(
            'flex min-h-[44px] shrink-0 snap-start items-stretch overflow-hidden rounded-full border bg-zinc-900',
            filterDate ? 'border-accent/40' : 'border-zinc-800'
          )}
        >
          <label className="sr-only" htmlFor="training-coach-date-native">
            Filter by date
          </label>
          <div
            className={cn(
              'flex min-w-[7.5rem] items-center gap-1.5 px-2 sm:hidden',
              filterDate ? 'text-accent' : 'text-zinc-300'
            )}
          >
            <Calendar className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <input
              id="training-coach-date-native"
              type="date"
              min={coachDateFilterBounds.minYmd}
              max={coachDateFilterBounds.maxYmd}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="min-h-[40px] w-[min(11rem,calc(100vw-6rem))] flex-1 cursor-pointer bg-transparent text-sm font-medium text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-md"
            />
          </div>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'hidden min-h-[44px] sm:flex min-w-[9rem] max-w-[12rem] items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  filterDate ? 'text-accent' : 'text-zinc-300'
                )}
                aria-label={
                  filterDate
                    ? `Filter by date, ${formatEST(parseISO(`${filterDate}T12:00:00`), 'EEE MMM d')}. Open calendar.`
                    : 'Filter coaches by date'
                }
              >
                <Calendar className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="truncate">
                  {filterDate
                    ? formatEST(parseISO(`${filterDate}T12:00:00`), 'EEE MMM d')
                    : 'Date'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              collisionPadding={16}
              className={cn(
                'z-[200] w-auto max-w-[min(calc(100vw-2rem),20rem)] border border-zinc-200 bg-white p-2 text-zinc-900 shadow-2xl',
                'sm:max-w-none sm:min-w-[280px] sm:p-3'
              )}
            >
              <CalendarGrid
                className="w-full bg-transparent p-1 text-zinc-900 sm:p-2"
                classNames={{
                  weekday: 'text-center text-[0.8rem] font-medium text-zinc-500 py-2',
                  outside: 'text-zinc-400 opacity-70 aria-selected:opacity-40',
                  disabled: 'text-zinc-300 opacity-60',
                }}
                mode="single"
                selected={filterDate ? parseISO(`${filterDate}T12:00:00`) : undefined}
                onSelect={(d) => {
                  if (!d) return;
                  setFilterDate(formatEST(d, 'yyyy-MM-dd'));
                  setDateOpen(false);
                }}
                defaultMonth={
                  filterDate
                    ? parseISO(`${filterDate}T12:00:00`)
                    : parseISO(`${coachDateFilterBounds.minYmd}T12:00:00`)
                }
                disabled={(d) => {
                  const ymd = formatEST(d, 'yyyy-MM-dd');
                  return ymd < coachDateFilterBounds.minYmd || ymd > coachDateFilterBounds.maxYmd;
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {filterDate ? (
            <button
              type="button"
              onClick={() => {
                setFilterDate('');
                setDateOpen(false);
              }}
              className="border-l border-zinc-800 px-2.5 text-lg leading-none text-zinc-400 hover:text-accent touch-manipulation"
              aria-label="Clear date filter"
            >
              ×
            </button>
          ) : null}
        </div>

        <label className="sr-only" htmlFor="training-coach-location">
          Location
        </label>
        <select
          id="training-coach-location"
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
          className="min-h-[44px] w-full min-w-[10rem] max-w-[min(100%,20rem)] shrink-0 snap-start rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:w-auto"
        >
          <option value="all">All locations</option>
          {locationFacilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <div
          className="flex shrink-0 snap-start items-center gap-1.5 overflow-x-auto rounded-full border border-zinc-800 bg-zinc-900 py-1 pl-1 pr-1 sm:max-w-none sm:flex-wrap sm:overflow-visible"
          role="group"
          aria-label="Session type"
        >
          {SESSION_TYPE_PILLS.map((pill) => {
            const selected = sessionType === pill.value;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setSessionType(pill.value)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition-colors touch-manipulation sm:text-sm',
                  selected
                    ? 'bg-accent/25 text-accent ring-1 ring-accent/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <span className="sm:hidden">{pill.labelShort ?? pill.label}</span>
                <span className="hidden sm:inline">{pill.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setAvailableOnly((v) => !v)}
          aria-pressed={availableOnly}
          title="Coaches with upcoming open sessions only"
          className={`min-h-[44px] shrink-0 snap-start self-center whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
            availableOnly
              ? 'bg-accent/20 text-accent border-accent/30'
              : 'bg-zinc-900 text-zinc-300 border-zinc-800'
          }`}
        >
          Available
        </button>

        {filtersActive ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="min-h-[44px] shrink-0 snap-start whitespace-nowrap rounded-full border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-accent/40 hover:text-accent sm:text-sm"
          >
            Clear filters
          </button>
        ) : null}
        </div>
      </div>}

      {showDateEmpty ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
          <p className="text-sm text-zinc-300">
            No coaches available on {formatEST(parseISO(`${filterDate}T12:00:00`), 'EEE MMM d')} — try another day
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-[44px] w-full max-w-sm border-accent text-accent hover:bg-accent/10"
            onClick={() => setFilterDate('')}
          >
            Clear date filter
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {sorted.map((a) => {
          const isFollowed = followedCoachIds.has(a.id);
          const next = a.nextAvailable;
          const nextLabel = next
            ? formatCoachNextLine(next.slot_date, next.start_time)
            : 'No upcoming sessions';
          return (
            <div
              key={a.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col"
            >
              <Link href={profileHref(a.id)} className="block aspect-square w-full bg-black overflow-hidden rounded-t-xl">
                <ProfileImage
                  src={a.photo_url}
                  alt={`${a.first_name} ${a.last_name}`}
                  focusX={a.photo_focus_x ?? 50}
                  focusY={a.photo_focus_y ?? 15}
                  rounded="lg"
                  fit="contain"
                  className="w-full h-full min-h-[140px] rounded-none bg-black"
                  fallbackIconClassName="h-16 w-16 text-muted-foreground"
                />
              </Link>
              <div className="p-3 flex flex-col flex-1 gap-2 min-h-0">
                <div className="flex items-start gap-1.5 min-w-0">
                  <Link
                    href={profileHref(a.id)}
                    className="font-semibold text-foreground text-sm leading-tight hover:underline flex-1 min-w-0"
                  >
                    {a.first_name} {a.last_name}
                  </Link>
                  <TrainingFollowHeartIcon
                    coachId={a.id}
                    isFollowed={isFollowed}
                    onFollowChange={setFollowedCoachIds}
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap text-xs text-zinc-500">
                  {a.school && <SchoolLogo school={a.school} size="sm" />}
                  <span className="truncate">{a.school}</span>
                  {a.weight_class && <span>· {a.weight_class} lbs</span>}
                  {a.year && <span>· {a.year}</span>}
                </div>
                <StarRating averageRating={a.average_rating} reviewCount={a.review_count} size="sm" />
                <p className="text-xs text-zinc-400 mt-auto line-clamp-2">{nextLabel}</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    className="min-h-[44px] text-xs px-2 bg-accent hover:bg-accent-hover text-black border-0 font-semibold"
                    asChild
                  >
                    <Link
                      href={
                        preselectedWrestlerId
                          ? `/book/${a.id}?youthWrestlerId=${encodeURIComponent(preselectedWrestlerId)}`
                          : `/book/${a.id}`
                      }
                    >
                      Book Now
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-[44px] text-xs px-2" asChild>
                    <Link href={profileHref(a.id)}>View Profile</Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrainingFollowHeartIcon({
  coachId,
  isFollowed,
  onFollowChange,
}: {
  coachId: string;
  isFollowed: boolean;
  onFollowChange: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { user, userRole } = useAuth();
  const [following, setFollowing] = useState(isFollowed);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFollowing(isFollowed);
  }, [isFollowed]);

  const iconBtnClass =
    'h-8 w-8 min-h-8 min-w-8 shrink-0 rounded-full p-0 border-accent/50 hover:bg-accent/10';

  if (!user || (userRole !== 'parent' && userRole !== 'admin')) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={iconBtnClass}
        disabled
        title="Sign in as a parent to follow coaches"
        aria-label="Follow (sign in required)"
      >
        <Heart className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </Button>
    );
  }

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        const r = await fetch(`/api/coach-follows?coachId=${encodeURIComponent(coachId)}`, { method: 'DELETE' });
        if (r.ok) {
          setFollowing(false);
          onFollowChange((prev) => {
            const n = new Set(prev);
            n.delete(coachId);
            return n;
          });
        }
      } else {
        const r = await fetch('/api/coach-follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coachId }),
        });
        if (r.ok) {
          setFollowing(true);
          onFollowChange((prev) => new Set(prev).add(coachId));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={`${iconBtnClass} ${following ? 'bg-accent hover:bg-accent-hover text-black border-0 hover:text-black' : ''}`}
      onClick={() => void toggle()}
      disabled={loading}
      aria-pressed={following}
      aria-label={following ? 'Unfollow coach' : 'Follow coach'}
      title={following ? 'Unfollow' : 'Follow'}
    >
      <Heart className={`h-3.5 w-3.5 ${following ? 'fill-current' : ''}`} aria-hidden />
    </Button>
  );
}
