'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { MapPin, Calendar, Users, Clock, ShoppingCart, Check, ChevronRight, Filter, X, Copy, Lock, Minus } from 'lucide-react';
import { useCart } from '@/lib/cart-context';
import { formatEST, APP_TIMEZONE } from '@/lib/format-date';
import { toZonedTime } from 'date-fns-tz';
import { startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { SchoolLogo } from '@/components/school-logo';
import { StarRating } from '@/components/star-rating';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { ProfileImage } from '@/components/profile-image';
import {
  getEffectiveFilledCount,
  isSessionOpenForParentBrowse,
} from '@/lib/sessions';
import { SessionRosterList, WrestlerFitLegend } from '@/components/session-roster-badges';
import type { SessionRosterParticipant } from '@/lib/wrestler-roster-display';

type Facility = { id: string; name?: string; school?: string; address?: string | null };
type SessionRow = {
  id: string;
  scheduled_datetime: string;
  status?: string | null;
  session_type: string | null;
  session_mode: string | null;
  join_policy?: string | null;
  focus_area: string | null;
  current_participants: number | null;
  max_participants: number | null;
  total_price: number | null;
  price_per_participant: number | null;
  athlete_id: string;
  facility_id: string;
  athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string; average_rating?: number | null; review_count?: number | null } | null;
  facilities?: { id: string; name?: string; address?: string } | null;
  session_participants?: Array<{
    id?: string;
    youth_wrestler_id?: string | null;
    roster_first_name?: string | null;
    roster_last_name?: string | null;
    roster_photo_url?: string | null;
    youth_wrestlers?: { id: string; first_name?: string; last_name?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; photo_url?: string }[] | null;
  } | null>;
};

type CoachOption = { id: string; first_name?: string; last_name?: string; school?: string };

type RequestCoachRow = {
  id: string;
  first_name?: string;
  last_name?: string;
  school?: string;
  photo_url?: string | null;
};

export function FindTrainingClient({
  facilities,
  initialSessions,
  initialDate,
  initialTime,
  initialLocation,
  initialCoach = '',
  coaches = [],
  searchBasePath = '/find-training',
  defaultRangeLabel,
  preselectedWrestlerId = '',
  parentWrestlerIds = [],
  initialSessionType = 'all',
  requestSessionCoaches = [],
  serviceTypesByCoach = {},
}: {
  facilities: Facility[];
  initialSessions: SessionRow[];
  initialDate: string;
  initialTime: string;
  initialLocation: string;
  initialCoach?: string;
  coaches?: CoachOption[];
  searchBasePath?: string;
  defaultRangeLabel?: string;
  preselectedWrestlerId?: string;
  parentWrestlerIds?: string[];
  initialSessionType?: string;
  requestSessionCoaches?: RequestCoachRow[];
  serviceTypesByCoach?: Record<string, string[]>;
}) {
  const router = useRouter();
  const { addItem, removeItem, isInCart, items } = useCart();
  const [date, setDate] = useState(initialDate || '');
  const [time, setTime] = useState(initialTime || 'any');
  const [location, setLocation] = useState(initialLocation || 'all');
  const [coach, setCoach] = useState(initialCoach || 'all');
  const [sessionType, setSessionType] = useState<string>(initialSessionType || 'all');
  const [dowFilter, setDowFilter] = useState<number | 'all'>('all');
  const [durationFilter, setDurationFilter] = useState<'any' | '60' | '90' | '120'>('any');
  const [dateOpen, setDateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [sessionRosters, setSessionRosters] = useState<Record<string, SessionRosterParticipant[]>>({});

  // Fetch participant rosters from API (bypasses RLS)
  useEffect(() => {
    const sessionIds = initialSessions.map((s) => s.id);
    if (sessionIds.length === 0) return;

    fetch('/api/sessions/participant-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds }),
    })
      .then((r) => r.json())
      .then((data: { rosters?: Record<string, SessionRosterParticipant[]> }) => {
        if (data.rosters) {
          setSessionRosters(data.rosters);
        }
      })
      .catch(() => {});
  }, [initialSessions]);

  useEffect(() => {
    setDate(initialDate || '');
    setTime(initialTime || 'any');
    setLocation(initialLocation || 'all');
    setCoach(initialCoach || 'all');
    setSessionType(initialSessionType || 'all');
  }, [initialDate, initialTime, initialLocation, initialCoach, initialSessionType]);

  // Filter sessions client-side
  // Hide invite-only sessions that are FULL (no value showing something user can't access)
  // Show invite-only sessions with spots (creates FOMO/social proof)
  const openSessions = initialSessions.filter((s) => {
    const isInviteOnly = (s as { join_policy?: string | null }).join_policy === 'invite_only';
    const max = s.max_participants ?? 1;
    const current = getEffectiveFilledCount(s);
    const isFull = current >= max;
    
    // Hide full invite-only sessions
    if (isInviteOnly && isFull) return false;
    
    // Session type filter (DB uses `small_group`; UI "Small Group" uses value `group`)
    if (sessionType === 'partner_private') {
      const st = s.session_type;
      if (st !== 'private' && st !== '2-athlete' && st !== 'partner') return false;
    } else if (sessionType === 'group') {
      const st = s.session_type;
      if (st !== 'group' && st !== 'small_group') return false;
    } else if (sessionType !== 'all' && s.session_type !== sessionType) return false;

    if (dowFilter !== 'all') {
      const localDow = toZonedTime(new Date(s.scheduled_datetime), APP_TIMEZONE).getDay();
      if (localDow !== dowFilter) return false;
    }

    if (durationFilter !== 'any') {
      const dm = (s as { duration_minutes?: number | null }).duration_minutes;
      if (Number(dm) !== Number(durationFilter)) return false;
    }

    if (location && location !== 'all' && s.facility_id !== location) return false;

    return true;
  });

  const filteredRequestCoaches = useMemo(() => {
    if (searchBasePath !== '/training' || requestSessionCoaches.length === 0) return [];
    return requestSessionCoaches.filter((c) => {
      const types = serviceTypesByCoach[c.id] ?? [];
      if (sessionType === 'all') return true;
      if (sessionType === 'group') return types.includes('small_group');
      if (sessionType === 'partner_private') {
        return types.includes('private') || types.includes('partner');
      }
      return types.includes(sessionType);
    });
  }, [searchBasePath, requestSessionCoaches, serviceTypesByCoach, sessionType]);

  const applyFilters = (overrides?: { type?: string; coachId?: string }) => {
    const params = new URLSearchParams();
    if (searchBasePath === '/dashboard') params.set('tab', 'find-training');
    if (searchBasePath === '/training') params.set('tab', 'sessions');
    if (date) params.set('date', date);
    if (time && time !== 'any') params.set('time', time);
    if (location && location !== 'all') params.set('location', location);
    const c = overrides?.coachId ?? coach;
    if (c && c !== 'all') params.set('coach', c);
    const t = overrides?.type ?? sessionType;
    if (t && t !== 'all') params.set('type', t);
    router.push(`${searchBasePath}?${params.toString()}`);
    setShowFilters(false);
  };
  
  const sessionTypeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'group', label: 'Small Group' },
    { value: 'partner_private', label: 'Partner / Private' },
  ];

  const dowOptions: { v: number | 'all'; label: string }[] = [
    { v: 'all', label: 'Any day' },
    { v: 0, label: 'Sun' },
    { v: 1, label: 'Mon' },
    { v: 2, label: 'Tue' },
    { v: 3, label: 'Wed' },
    { v: 4, label: 'Thu' },
    { v: 5, label: 'Fri' },
    { v: 6, label: 'Sat' },
  ];

  const durationOptions: { v: 'any' | '60' | '90' | '120'; label: string }[] = [
    { v: 'any', label: 'Any duration' },
    { v: '60', label: '60 min' },
    { v: '90', label: '90 min' },
    { v: '120', label: '120 min' },
  ];

  const clearFilters = () => {
    setDate('');
    setTime('any');
    setLocation('all');
    setCoach('all');
    setSessionType('all');
    setDowFilter('all');
    setDurationFilter('any');
    router.push(searchBasePath);
  };

  const hasActiveFilters =
    date ||
    time !== 'any' ||
    location !== 'all' ||
    coach !== 'all' ||
    sessionType !== 'all' ||
    dowFilter !== 'all' ||
    durationFilter !== 'any';
  const activeFilterCount = [
    date,
    time !== 'any',
    location !== 'all',
    coach !== 'all',
    sessionType !== 'all',
    dowFilter !== 'all',
    durationFilter !== 'any',
  ].filter(Boolean).length;

  // Filter pills data
  const timeOptions = [
    { value: 'any', label: 'Any time' },
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' },
  ];

  const SessionCard = ({ session }: { session: SessionRow }) => {
    const coachData = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
    const facilityData = Array.isArray(session.facilities) ? session.facilities[0] : session.facilities;
    const dt = new Date(session.scheduled_datetime);
    const max = session.max_participants ?? 1;
    const current = getEffectiveFilledCount(session);
    const openSlots = Math.max(0, max - current);
    const price = session.price_per_participant;
    const cartQty = items.filter((i) => i.id === session.id).length;
    const maxCartQty = Math.min(
      openSlots,
      parentWrestlerIds.length >= 1 ? parentWrestlerIds.length : 1
    );
    const isInviteOnly = (session as { join_policy?: string | null }).join_policy === 'invite_only';
    const isPartner = session.session_type === '2-athlete' || session.session_type === 'partner';
    const isPrivate = session.session_type === 'private';
    const duration = (session as { duration_minutes?: number | null }).duration_minutes;
    
    // Check how many of parent's wrestlers are already booked for this session
    const bookedWrestlerIds = (session.session_participants || [])
      .map((p) => {
        const yw = p?.youth_wrestlers;
        const wrestler = Array.isArray(yw) ? yw[0] : yw;
        return p?.youth_wrestler_id || wrestler?.id;
      })
      .filter(Boolean) as string[];
    const parentBookedCount = parentWrestlerIds.filter((id) => bookedWrestlerIds.includes(id)).length;
    const allParentWrestlersBooked = parentWrestlerIds.length > 0 && parentBookedCount >= parentWrestlerIds.length;

    // Dim card only when the session is actually closed — not when this parent is already registered.
    const isSessionClosed = openSlots === 0 || isInviteOnly;
    const getSpotColor = () => {
      if (openSlots === 0) return 'text-zinc-500'; // Full - grey
      if (isPrivate && openSlots > 0) return 'text-emerald-400'; // Private available - green
      if (isPartner && current === 1) return 'text-amber-400'; // Waiting on partner - orange
      if (openSlots === 1) return 'text-red-400'; // Last spot - red
      return 'text-zinc-400'; // Normal - white/grey
    };
    
    // Get spot display text per spec
    const getSpotText = () => {
      if (openSlots === 0) return `Full · ${current}/${max}`;
      if (isPrivate) return 'Available';
      if (isPartner && current === 1) return `${current}/${max} · Waiting on partner`;
      return `${current}/${max} · ${openSlots} spot${openSlots !== 1 ? 's' : ''} left`;
    };
    
    const registeredStatus = (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-3 py-2.5 min-h-[44px] rounded flex items-center gap-1.5">
          <Check className="h-3 w-3" aria-hidden />
          Registered
        </span>
        {openSlots > 0 && (
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {openSlots} spot{openSlots !== 1 ? 's' : ''} still open
          </span>
        )}
      </div>
    );

    const copySessionLink = (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = `${window.location.origin}/sessions/${session.id}`;
      void navigator.clipboard.writeText(url);
    };

    const buildCartPayload = () => ({
      id: session.id,
      scheduled_datetime: session.scheduled_datetime,
      session_type: session.session_type,
      price_per_participant: session.price_per_participant,
      coach_name: coachData ? [coachData.first_name, coachData.last_name].filter(Boolean).join(' ') : 'Coach',
      coach_id: coachData?.id ?? session.athlete_id,
      facility_name: facilityData?.name ?? '',
    });

    const handleAddOne = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (cartQty >= maxCartQty) return;
      addItem({ ...buildCartPayload(), lineId: crypto.randomUUID() });
    };

    const handleRemoveOne = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const linesForSession = items.filter((i) => i.id === session.id);
      const last = linesForSession[linesForSession.length - 1];
      if (last) removeItem(last.lineId);
    };

    return (
      <div className={cn(
        "bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 transition-all",
        isSessionClosed ? "opacity-60" : "hover:border-zinc-700"
      )}>
        {/* Mobile: Stack layout, Desktop: Row layout */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Top row on mobile: Photo + Session Type + Price */}
          <div className="flex items-start gap-3 sm:contents">
            {/* Coach Photo */}
            <Link href={`/athlete/${coachData?.id ?? session.athlete_id}`} className="shrink-0">
              <ProfileImage
                src={coachData?.photo_url}
                alt={coachData ? `${coachData.first_name} ${coachData.last_name}` : 'Coach'}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full"
                fallbackIconClassName="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground"
              />
            </Link>

            {/* Mobile: Session type + date inline with photo (same meta as desktop: Share, focus) */}
            <div className="flex-1 min-w-0 sm:hidden">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <SessionTypeBadge sessionType={session.session_type} sessionMode={session.session_mode} />
                {(session as { join_policy?: string | null }).join_policy === 'invite_only' ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-400 border border-amber-700/50">
                    Invite Only
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
                    Open
                  </span>
                )}
                <button
                  type="button"
                  onClick={copySessionLink}
                  className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                  title="Copy session link"
                >
                  <Copy className="h-3 w-3" />
                  Share
                </button>
                {session.focus_area && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    {session.focus_area}
                  </span>
                )}
              </div>
              <p className="font-semibold text-foreground text-sm mt-1">
                {formatEST(dt, 'EEE, MMM d · h:mm a')}
              </p>
            </div>

            {/* Mobile: Price in top right */}
            <div className="sm:hidden shrink-0">
              {price != null && price > 0 && (
                <span className="text-base font-bold text-foreground">${price}</span>
              )}
            </div>
          </div>

          {/* Session Info - Desktop version */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {/* Type & Focus & Join Policy */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <SessionTypeBadge sessionType={session.session_type} sessionMode={session.session_mode} />
              {(session as { join_policy?: string | null }).join_policy === 'invite_only' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/50 text-amber-400 border border-amber-700/50">
                  Invite Only
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
                  Open
                </span>
              )}
              <button
                type="button"
                onClick={copySessionLink}
                className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                title="Copy session link"
              >
                <Copy className="h-3 w-3" />
                Share
              </button>
              {session.focus_area && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {session.focus_area}
                </span>
              )}
            </div>

            {/* Date & Time */}
            <p className="font-semibold text-foreground">
              {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
            </p>

            {/* Coach Info */}
            <div className="flex items-center gap-2 mt-1">
              <Link 
                href={`/athlete/${coachData?.id ?? session.athlete_id}`}
                className="text-sm text-zinc-300 hover:text-foreground transition-colors"
              >
                {coachData ? `${coachData.first_name} ${coachData.last_name}` : 'Coach'}
              </Link>
              {coachData?.school && (
                <SchoolLogo school={coachData.school} size="sm" />
              )}
              {coachData && (
                <StarRating
                  averageRating={coachData.average_rating}
                  reviewCount={coachData.review_count}
                  size="sm"
                />
              )}
            </div>

            {/* Location, Duration & Spots */}
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
              {facilityData && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {facilityData.name}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {duration >= 120 ? `${duration / 60} hrs` : `${duration} min`}
                </span>
              )}
              <span className={cn("flex items-center gap-1", getSpotColor())}>
                <Users className="h-3 w-3" />
                {getSpotText()}
              </span>
            </div>

            {current > 0 && (
              <SessionRosterList
                participants={sessionRosters[session.id] ?? []}
                label="Registered"
                className="mt-2"
                emptyFallback={`${current} registered — athlete details loading…`}
              />
            )}
          </div>

          {/* Mobile: Coach + Details row */}
          <div className="sm:hidden">
            <div className="flex items-center gap-2">
              <Link 
                href={`/athlete/${coachData?.id ?? session.athlete_id}`}
                className="text-sm text-zinc-300 hover:text-foreground transition-colors"
              >
                {coachData ? `${coachData.first_name} ${coachData.last_name}` : 'Coach'}
              </Link>
              {coachData?.school && (
                <SchoolLogo school={coachData.school} size="sm" />
              )}
              {coachData && (
                <StarRating
                  averageRating={coachData.average_rating}
                  reviewCount={coachData.review_count}
                  size="sm"
                />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 flex-wrap">
              {facilityData && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {facilityData.name}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {duration >= 120 ? `${duration / 60} hrs` : `${duration} min`}
                </span>
              )}
              <span className={cn("flex items-center gap-1", getSpotColor())}>
                <Users className="h-3 w-3" />
                {getSpotText()}
              </span>
            </div>

            {current > 0 && (
              <SessionRosterList
                participants={sessionRosters[session.id] ?? []}
                label="Registered"
                className="mt-2"
                emptyFallback={`${current} registered — athlete details loading…`}
              />
            )}
          </div>

          {/* Price & Action - Desktop only (mobile shows price in top row) */}
          <div className="hidden sm:flex flex-col items-end justify-between shrink-0">
            {price != null && price > 0 && (
              <span className="text-lg font-bold text-foreground">${price}</span>
            )}
            {/* Button States:
                - All parent's wrestlers registered: "Registered" (session may still have open spots)
                - Invite-only without access: Lock icon, no action
                - Full: "Full" badge, no action
                - In Cart: Navigate to cart
                - Open: Add to Cart
            */}
            {allParentWrestlersBooked ? (
              registeredStatus
            ) : openSlots > 0 ? (
              isInviteOnly ? (
                <span className="text-xs text-zinc-500 bg-zinc-800 px-3 py-2.5 min-h-[44px] rounded flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Invite Only
                </span>
              ) : cartQty === 0 ? (
                <Button
                  size="sm"
                  onClick={handleAddOne}
                  className="min-h-[44px] min-w-[44px] gap-1.5 transition-all bg-accent hover:bg-accent-hover text-black"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add
                </Button>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveOne}
                      className="h-10 w-10 p-0 border-zinc-600"
                      aria-label="Remove one spot"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">{cartQty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddOne}
                      disabled={cartQty >= maxCartQty}
                      className="h-10 w-10 p-0 border-zinc-600 disabled:opacity-40"
                      aria-label="Add another spot"
                    >
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push('/cart');
                    }}
                    className="h-8 text-xs text-accent hover:text-accent/90"
                  >
                    View cart
                  </Button>
                </div>
              )
            ) : (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-3 py-2.5 min-h-[44px] rounded flex items-center">Full</span>
            )}
          </div>

          {/* Mobile Action Button - Full width at bottom */}
          <div className="sm:hidden mt-3 pt-3 border-t border-zinc-800">
            {(() => {
              if (allParentWrestlersBooked) {
                return (
                  <div className="w-full flex flex-col items-center gap-1">
                    <span className="w-full text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-3 py-2.5 min-h-[44px] rounded flex items-center justify-center gap-1.5">
                      <Check className="h-3 w-3" aria-hidden />
                      Registered
                    </span>
                    {openSlots > 0 && (
                      <span className="text-[10px] text-zinc-500 tabular-nums">
                        {openSlots} spot{openSlots !== 1 ? 's' : ''} still open
                      </span>
                    )}
                  </div>
                );
              }
              if (openSlots <= 0) {
                return (
                  <span className="w-full text-xs text-zinc-500 bg-zinc-800 px-3 py-2.5 min-h-[44px] rounded flex items-center justify-center">Full</span>
                );
              }
              if (isInviteOnly) {
                return (
                  <span className="w-full text-xs text-zinc-500 bg-zinc-800 px-3 py-2.5 min-h-[44px] rounded flex items-center justify-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    Invite Only
                  </span>
                );
              }
              if (cartQty === 0) {
                return (
                  <Button
                    size="sm"
                    onClick={handleAddOne}
                    className="w-full min-h-[44px] gap-1.5 transition-all bg-accent hover:bg-accent-hover text-black"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </Button>
                );
              }
              return (
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveOne}
                      className="h-11 w-11 p-0 border-zinc-600"
                      aria-label="Remove one spot"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[2.5rem] text-center text-lg font-semibold tabular-nums">{cartQty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAddOne}
                      disabled={cartQty >= maxCartQty}
                      className="h-11 w-11 p-0 border-zinc-600 disabled:opacity-40"
                      aria-label="Add another spot"
                    >
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push('/cart');
                    }}
                    className="w-full min-h-[44px] text-accent border-accent/30"
                  >
                    View cart · ${((price ?? 0) * cartQty).toFixed(0)}
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed -mx-4 px-4">
        <span className="font-medium text-zinc-400">Session types:</span> Private — one athlete with the coach. Partner
        — two athletes with the same coach (you need a second wrestler). Small group — coach with several athletes;
        spots are limited per session.
      </p>
      {/* Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {/* Date Picker */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                date
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700"
              )}
            >
              <Calendar className="h-4 w-4" />
              {date ? formatEST(new Date(date + 'T12:00:00'), 'MMM d') : 'Date'}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              'z-[200] w-auto max-w-[min(calc(100vw-2rem),20rem)] min-w-[260px] border border-zinc-700 bg-zinc-950 p-2 text-zinc-100 shadow-2xl',
              'sm:min-w-[280px] sm:p-3'
            )}
          >
            <CalendarComponent
              className="w-full bg-transparent p-1 text-zinc-100 [--rdp-accent-color:#B89D60] [--rdp-accent-background-color:rgba(184,157,96,0.22)] sm:p-2"
              classNames={{
                weekday: 'text-center text-[0.8rem] font-medium text-zinc-400 py-2',
                outside: 'text-zinc-500 opacity-70 aria-selected:opacity-40',
                disabled: 'text-zinc-600 opacity-60',
              }}
              mode="single"
              selected={date ? new Date(date + 'T12:00:00') : undefined}
              onSelect={(d) => {
                if (d) {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  setDate(`${y}-${m}-${day}`);
                  setDateOpen(false);
                  // Auto-apply filter
                  const params = new URLSearchParams();
                  if (searchBasePath === '/training') params.set('tab', 'sessions');
                  params.set('date', `${y}-${m}-${day}`);
                  if (time !== 'any') params.set('time', time);
                  if (location !== 'all') params.set('location', location);
                  if (coach !== 'all') params.set('coach', coach);
                  router.push(`${searchBasePath}?${params.toString()}`);
                }
              }}
              disabled={(d) => d < startOfDay(new Date())}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Time Pills */}
        {timeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setTime(opt.value);
              const params = new URLSearchParams();
              if (searchBasePath === '/training') params.set('tab', 'sessions');
              if (date) params.set('date', date);
              if (opt.value !== 'any') params.set('time', opt.value);
              if (location !== 'all') params.set('location', location);
              if (coach !== 'all') params.set('coach', coach);
              router.push(`${searchBasePath}?${params.toString()}`);
            }}
            className={cn(
              "px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
              time === opt.value
                ? "bg-accent/20 text-accent border-accent/30"
                : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700"
            )}
          >
            {opt.label}
          </button>
        ))}

        {/* Session Type Pills */}
        {sessionTypeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setSessionType(opt.value);
              applyFilters({ type: opt.value });
            }}
            className={cn(
              "px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
              sessionType === opt.value
                ? "bg-accent/20 text-accent border-accent/30"
                : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700"
            )}
          >
            {opt.label}
          </button>
        ))}

        {dowOptions.map((opt) => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => setDowFilter(opt.v)}
            className={cn(
              'min-h-[44px] px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border',
              dowFilter === opt.v
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            )}
          >
            {opt.label}
          </button>
        ))}

        {durationOptions.map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setDurationFilter(opt.v)}
            className={cn(
              'min-h-[44px] px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border',
              durationFilter === opt.v
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
            )}
          >
            {opt.label}
          </button>
        ))}

        {/* Coach Dropdown */}
        {coaches.length > 0 && (
          <Popover open={coachOpen} onOpenChange={setCoachOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
                  coach !== 'all'
                    ? "bg-accent/20 text-accent border-accent/30"
                    : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700"
                )}
              >
                {coach !== 'all' 
                  ? coaches.find(c => c.id === coach)?.first_name || 'Coach'
                  : 'Coach'}
                <ChevronRight className="h-3 w-3 rotate-90" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <button
                onClick={() => {
                  setCoach('all');
                  setCoachOpen(false);
                  applyFilters({ coachId: 'all' });
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded text-sm hover:bg-zinc-800",
                  coach === 'all' && "bg-zinc-800 text-accent"
                )}
              >
                All Coaches
              </button>
              {coaches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCoach(c.id);
                    setCoachOpen(false);
                    applyFilters({ coachId: c.id });
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded text-sm hover:bg-zinc-800",
                    coach === c.id && "bg-zinc-800 text-accent"
                  )}
                >
                  {c.first_name} {c.last_name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* More Filters Button (Location only now) */}
        <button
          onClick={() => setShowFilters(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
            location !== 'all'
              ? "bg-accent/20 text-accent border-accent/30"
              : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700"
          )}
        >
          <Filter className="h-4 w-4" />
          Location
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-zinc-300 whitespace-nowrap"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Filter Sheet/Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => setShowFilters(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl p-6 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="p-2 hover:bg-zinc-800 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Location Filter */}
            <div className="mb-6">
              <label className="text-sm font-medium text-zinc-400 mb-2 block">Facility</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setLocation('all')}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm transition-all",
                    location === 'all' ? "bg-accent text-black" : "bg-zinc-800 text-zinc-300"
                  )}
                >
                  All locations
                </button>
                {facilities.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setLocation(f.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-all",
                      location === f.id ? "bg-accent text-black" : "bg-zinc-800 text-zinc-300"
                    )}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Coach Filter */}
            {coaches.length > 0 && (
              <div className="mb-6">
                <label className="text-sm font-medium text-zinc-400 mb-2 block">Coach</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCoach('all')}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-all",
                      coach === 'all' ? "bg-accent text-black" : "bg-zinc-800 text-zinc-300"
                    )}
                  >
                    Any coach
                  </button>
                  {coaches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCoach(c.id)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm transition-all",
                        coach === c.id ? "bg-accent text-black" : "bg-zinc-800 text-zinc-300"
                      )}
                    >
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Apply Button */}
            <Button 
              onClick={applyFilters}
              className="w-full bg-accent hover:bg-accent-hover text-black font-medium h-12"
            >
              Apply Filters
            </Button>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">
            {openSessions.length} public session{openSessions.length !== 1 ? 's' : ''} you can join
            {defaultRangeLabel && !date && <span className="text-zinc-500"> · {defaultRangeLabel}</span>}
          </p>
        </div>
        <WrestlerFitLegend />
      </div>

      {/* Sessions List */}
      {openSessions.length > 0 ? (
        <div className="space-y-3">
          {openSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-zinc-700" />
          <p className="text-zinc-400 mb-2">No public sessions match</p>
          <p className="text-sm text-zinc-500">
            {hasActiveFilters ? 'Try adjusting your filters.' : 'Try another day or time, or book directly with a coach.'}
          </p>
          <p className="text-sm text-zinc-500 mt-4 max-w-md mx-auto">
            <Link href="/browse" className="text-accent hover:underline">
              Browse coaches
            </Link>{' '}
            to book from their availability—what you see here are only join-in sessions coaches have posted.
          </p>
        </div>
      )}

      {filteredRequestCoaches.length > 0 && (
        <section className="mt-8 pt-6 border-t border-zinc-800" aria-label="Book private or partner">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Book private or partner
          </h3>
          <p className="text-sm text-zinc-400 mb-4">
            These coaches publish availability for one-on-one or partner work—a public join-in session above is never
            required.
          </p>
          <div className="space-y-3">
            {filteredRequestCoaches.map((c) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Coach';
              const bookHref = preselectedWrestlerId
                ? `/book/${c.id}?youthWrestlerId=${encodeURIComponent(preselectedWrestlerId)}`
                : `/book/${c.id}`;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <Link href={`/athlete/${c.id}`} className="shrink-0">
                    <ProfileImage
                      src={c.photo_url}
                      alt={name}
                      className="w-14 h-14"
                      fallbackIconClassName="h-6 w-6 text-muted-foreground"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/athlete/${c.id}`} className="font-medium text-foreground hover:underline truncate block">
                      {name}
                    </Link>
                    {c.school ? (
                      <span className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                        <SchoolLogo school={c.school} size="sm" />
                        {c.school}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    className="shrink-0 min-h-[44px] bg-accent hover:bg-accent-hover text-black font-semibold text-sm"
                    asChild
                  >
                    <Link href={bookHref}>See availability</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
