'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-context';
import type { PublicOpenJoinSessionRow } from '@/lib/map/fetch-public-open-join-summaries';

type Props = {
  row: PublicOpenJoinSessionRow;
  isLoggedIn: boolean;
  parentWrestlerIds: string[];
  /** After login, return here so parents can + Add to cart (not the Register flow). */
  loginReturnPath?: string;
};

export function PublicOpenJoinSessionCartAction({
  row,
  isLoggedIn,
  parentWrestlerIds,
  loginReturnPath = '/#open-sessions',
}: Props) {
  const router = useRouter();
  const { addItem, removeItem, items, sessionLineCount } = useCart();
  const loginHref = `/login?redirect=${encodeURIComponent(loginReturnPath)}`;

  if (!isLoggedIn) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="whitespace-nowrap px-3 text-xs font-semibold"
        asChild
      >
        <Link href={loginHref}>+ Add</Link>
      </Button>
    );
  }

  const cartQty = sessionLineCount(row.sessionId);
  const maxCartQty = Math.min(
    row.openSlots,
    parentWrestlerIds.length >= 1 ? parentWrestlerIds.length : 1
  );
  const canAdd = row.openSlots > 0 && cartQty < maxCartQty;

  const nextWrestlerId = (): string | null => {
    if (parentWrestlerIds.length === 0) return null;
    const used = new Set(
      items
        .filter((i) => i.id === row.sessionId && i.athlete_id)
        .map((i) => i.athlete_id as string)
    );
    return parentWrestlerIds.find((id) => !used.has(id)) ?? parentWrestlerIds[0] ?? null;
  };

  const handleAddOne = () => {
    if (parentWrestlerIds.length === 0) {
      router.push('/wrestlers/add');
      return;
    }
    if (!canAdd) return;
    addItem({
      lineId: crypto.randomUUID(),
      id: row.sessionId,
      scheduled_datetime: row.scheduledAt,
      session_type: row.sessionType,
      price_per_participant: row.pricePerParticipant,
      coach_name: row.coachName,
      coach_id: row.coachId,
      facility_name: row.facilityName === '—' ? '' : row.facilityName,
      athlete_id: nextWrestlerId(),
    });
  };

  const handleRemoveOne = () => {
    const linesForSession = items.filter((i) => i.id === row.sessionId);
    const last = linesForSession[linesForSession.length - 1];
    if (last) removeItem(last.lineId);
  };

  if (cartQty === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddOne}
        disabled={!canAdd && parentWrestlerIds.length > 0}
        className="whitespace-nowrap px-3 text-xs font-semibold"
      >
        + Add
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRemoveOne}
        className="h-8 w-8 p-0"
        aria-label="Remove one spot"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-white/90">
        {cartQty}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddOne}
        disabled={!canAdd}
        className="h-8 w-8 p-0 disabled:opacity-40"
        aria-label="Add another wrestler"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
