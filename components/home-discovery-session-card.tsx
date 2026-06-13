'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-context';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { ProfileImage } from '@/components/profile-image';
import { getEffectiveFilledCount, isSessionOpenForParentBrowse } from '@/lib/sessions';

export type DiscoverySession = {
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  join_policy?: string | null;
  current_participants: number | null;
  max_participants: number | null;
  price_per_participant: number | null;
  duration_minutes?: number | null;
  athlete_id: string;
  athletes?: {
    id: string;
    first_name?: string;
    last_name?: string;
    school?: string;
    photo_url?: string;
    photo_focus_x?: number | null;
    photo_focus_y?: number | null;
    average_rating?: number | null;
    review_count?: number | null;
  } | null;
  facilities?: { id: string; name?: string } | null;
  session_participants?: Array<{
    id?: string;
    youth_wrestler_id?: string | null;
    youth_wrestlers?: { id: string; first_name?: string; last_name?: string } | null;
  }>;
};

type Props = {
  session: DiscoverySession;
  parentWrestlerIds: string[];
};

function formatDiscoverySessionTime(d: Date): string {
  const mins = formatEST(d, 'mm');
  if (mins === '00') {
    return `${formatEST(d, 'h')}${formatEST(d, 'a').toUpperCase()}`;
  }
  return formatEST(d, 'h:mm a');
}

export function HomeDiscoverySessionCard({ session, parentWrestlerIds }: Props) {
  const router = useRouter();
  const { addItem, sessionLineCount } = useCart();
  const coach = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const facility = Array.isArray(session.facilities) ? session.facilities[0] : session.facilities;
  const dt = new Date(session.scheduled_datetime);
  const max = session.max_participants ?? 1;
  const current = getEffectiveFilledCount(session as Parameters<typeof getEffectiveFilledCount>[0]);
  const openSlots = Math.max(0, max - current);
  const price = session.price_per_participant;
  const cartQty = sessionLineCount(session.id);
  const maxCartQty = Math.min(openSlots, parentWrestlerIds.length >= 1 ? parentWrestlerIds.length : 1);
  const inCart = cartQty > 0;
  const typeLabel = getSessionTypeDisplay(session.session_type ?? null, session.session_mode ?? null).label;
  const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() : 'Coach';
  const datePart = formatEST(dt, 'EEE MMM d');
  const timePart = formatDiscoverySessionTime(dt);
  const pricePart = price != null && price > 0 ? `$${price}` : '';

  if (!isSessionOpenForParentBrowse(session)) return null;

  const handleAdd = () => {
    if (inCart) return;
    const wid = parentWrestlerIds[0];
    if (!wid) {
      router.push('/wrestlers/add');
      return;
    }
    if (cartQty >= maxCartQty) return;
    addItem({
      lineId: crypto.randomUUID(),
      id: session.id,
      scheduled_datetime: session.scheduled_datetime,
      session_type: session.session_type,
      price_per_participant: session.price_per_participant,
      coach_name: coachName || 'Coach',
      coach_id: session.athlete_id,
      facility_name: facility?.name ?? '',
      athlete_id: wid,
    });
  };

  const summaryLine = [coachName, typeLabel, datePart, timePart, pricePart].filter(Boolean).join(' · ');

  return (
    <div className="flex h-[52px] max-h-[52px] min-h-[52px] w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
      <Link
        href={`/athlete/${session.athlete_id}`}
        className="shrink-0"
        aria-label={`View ${coachName}`}
      >
        <ProfileImage
          src={coach?.photo_url}
          alt={coachName}
          focusX={coach?.photo_focus_x ?? 50}
          focusY={coach?.photo_focus_y ?? 15}
          className="h-9 w-9 rounded-full"
          fallbackIconClassName="h-4 w-4 text-muted-foreground"
        />
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
        {summaryLine}
      </p>
      {inCart ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="h-9 min-w-[44px] shrink-0 border-accent/50 bg-transparent px-2 text-xs font-semibold text-zinc-300"
        >
          In Cart
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={openSlots <= 0 || cartQty >= maxCartQty}
          className="h-9 min-w-[44px] shrink-0 border-accent bg-transparent px-2 text-xs font-semibold text-accent hover:bg-accent/10 hover:text-accent"
        >
          + Add
        </Button>
      )}
    </div>
  );
}
