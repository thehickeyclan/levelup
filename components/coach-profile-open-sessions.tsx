'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { formatEST } from '@/lib/format-date';
import { useCart } from '@/lib/cart-context';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { MapPin, Users, ShoppingCart, Minus } from 'lucide-react';
export type CoachProfileOpenSessionRow = {
  id: string;
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  focus_area?: string | null;
  current_participants?: number | null;
  max_participants?: number | null;
  price_per_participant?: number | null;
  join_policy?: string | null;
  duration_minutes?: number | null;
  facilities?: { name?: string } | { name?: string }[] | null;
  session_participants?: unknown[] | null;
};

type Props = {
  coachId: string;
  coachName: string;
  sessions: CoachProfileOpenSessionRow[];
  parentWrestlerIds: string[];
  /** When set, register links include ?wrestler= for pre-select (must be serializable — no server functions). */
  preselectedYouthWrestlerId?: string | null;
};

function registerHref(sessionId: string, youthWrestlerId?: string | null) {
  if (youthWrestlerId) {
    return `/sessions/${sessionId}/register?wrestler=${encodeURIComponent(youthWrestlerId)}`;
  }
  return `/sessions/${sessionId}/register`;
}

export function CoachProfileOpenSessions({
  coachId,
  coachName,
  sessions,
  parentWrestlerIds,
  preselectedYouthWrestlerId = null,
}: Props) {
  const { addItem, removeItem, items } = useCart();

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const s = session;
        const dt = new Date(s.scheduled_datetime);
        const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
        const max = s.max_participants ?? 1;
        const current = getEffectiveFilledCount(s);
        const openSlots = Math.max(0, max - current);
        const price = s.price_per_participant;
        const policy = s.join_policy ?? 'public';
        const isInviteOnly = policy === 'invite_only';
        const duration = s.duration_minutes;
        const cartQty = items.filter((i) => i.id === s.id).length;
        const maxCartQty = Math.min(
          openSlots,
          parentWrestlerIds.length >= 1 ? parentWrestlerIds.length : 1
        );

        const buildCartPayload = () => ({
          id: s.id,
          scheduled_datetime: s.scheduled_datetime,
          session_type: s.session_type ?? null,
          price_per_participant: s.price_per_participant ?? null,
          coach_name: coachName,
          coach_id: coachId,
          facility_name: fac?.name ?? '',
        });

        const handleAddOne = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          if (openSlots <= 0 || cartQty >= maxCartQty) return;
          addItem({ ...buildCartPayload(), lineId: crypto.randomUUID() });
        };

        const handleRemoveOne = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const linesForSession = items.filter((i) => i.id === s.id);
          const last = linesForSession[linesForSession.length - 1];
          if (last) removeItem(last.lineId);
        };

        const canAddToCart = openSlots > 0 && (policy === 'public' || policy === 'invite_only');

        return (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-4 sm:flex-row sm:items-stretch"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <SessionTypeBadge sessionType={s.session_type ?? null} sessionMode={s.session_mode ?? null} />
                {isInviteOnly ? (
                  <span className="rounded-full border border-amber-700/50 bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">
                    Invite only
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-700/50 bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
                    Open
                  </span>
                )}
                {s.focus_area && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{s.focus_area}</span>
                )}
              </div>
              <p className="font-semibold text-foreground">
                {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                {fac?.name && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {fac.name}
                  </span>
                )}
                {duration != null && duration > 0 && (
                  <span>
                    {duration >= 120 ? `${duration / 60} hrs` : `${duration} min`}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {openSlots > 0
                    ? `${openSlots} spot${openSlots !== 1 ? 's' : ''} left`
                    : 'Full'}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-zinc-800 pt-3 sm:w-44 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              {price != null && price > 0 && (
                <span className="text-lg font-bold text-foreground sm:text-right">${price}</span>
              )}
              {!canAddToCart ? (
                <span className="flex min-h-[44px] items-center justify-center rounded bg-zinc-800 px-3 text-xs text-zinc-500">
                  Full
                </span>
              ) : cartQty === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddOne}
                  className="min-h-[44px] gap-1.5 bg-accent text-black hover:bg-accent-hover"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to cart
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRemoveOne}
                    className="h-10 w-10 p-0"
                    aria-label="Remove one"
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
                    className="h-10 w-10 p-0 disabled:opacity-40"
                    aria-label="Add another"
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button variant="outline" size="sm" className="min-h-[40px] w-full text-xs" asChild>
                <Link href={registerHref(s.id, preselectedYouthWrestlerId)}>Register</Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
