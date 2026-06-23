'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type CollectionPurchaseNotes = {
  purchase_source: string;
  purchase_price_dollars: string;
  purchased_at: string;
};

export function emptyCollectionPurchaseNotes(): CollectionPurchaseNotes {
  return {
    purchase_source: '',
    purchase_price_dollars: '',
    purchased_at: '',
  };
}

export function collectionPurchaseNotesFromListing(
  listing: Record<string, unknown>
): CollectionPurchaseNotes {
  const cents = listing.purchase_price_cents;
  return {
    purchase_source: String(listing.purchase_source ?? '').trim(),
    purchase_price_dollars:
      cents != null && Number.isFinite(Number(cents))
        ? String(Math.round(Number(cents) / 100))
        : '',
    purchased_at: listing.purchased_at ? String(listing.purchased_at).slice(0, 10) : '',
  };
}

export function collectionPurchaseNotesToPayload(notes: CollectionPurchaseNotes): {
  purchase_source: string | null;
  purchase_price_cents: number | null;
  purchased_at: string | null;
} {
  const source = notes.purchase_source.trim();
  const priceStr = notes.purchase_price_dollars.trim();
  let purchase_price_cents: number | null = null;
  if (priceStr) {
    const dollars = Number(priceStr);
    if (Number.isFinite(dollars) && dollars > 0) {
      purchase_price_cents = Math.round(dollars * 100);
    }
  }
  const date = notes.purchased_at.trim();
  return {
    purchase_source: source || null,
    purchase_price_cents,
    purchased_at: date || null,
  };
}

export function hasCollectionPurchaseNotes(listing: Record<string, unknown>): boolean {
  const notes = collectionPurchaseNotesFromListing(listing);
  return Boolean(
    notes.purchase_source || notes.purchase_price_dollars || notes.purchased_at
  );
}

export function CollectionPurchaseNotesFields({
  notes,
  onChange,
  className,
}: {
  notes: CollectionPurchaseNotes;
  onChange: (notes: CollectionPurchaseNotes) => void;
  className?: string;
}) {
  const hasContent = Boolean(
    notes.purchase_source.trim() ||
      notes.purchase_price_dollars.trim() ||
      notes.purchased_at.trim()
  );
  const [expanded, setExpanded] = useState(hasContent);

  useEffect(() => {
    if (hasContent) setExpanded(true);
  }, [hasContent]);

  return (
    <div className={cn('rounded-xl border border-border bg-muted/20', className)}>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left touch-manipulation"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Your purchase notes</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {expanded
              ? 'Where you got this pair, what you paid, and when — only you can see this.'
              : 'Optional — track source, price, and date (private to you).'}
          </p>
        </div>
        <span className="shrink-0 text-muted-foreground mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-3 px-4 pb-4 border-t border-border/60">
          <div>
            <Label className="text-xs">Where you bought it</Label>
            <Input
              value={notes.purchase_source}
              onChange={(e) => onChange({ ...notes, purchase_source: e.target.value })}
              placeholder="Retail store, teammate, eBay…"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">What you paid ($)</Label>
              <Input
                value={notes.purchase_price_dollars}
                onChange={(e) =>
                  onChange({
                    ...notes,
                    purchase_price_dollars: e.target.value.replace(/[^\d.]/g, ''),
                  })
                }
                placeholder="e.g. 120"
                inputMode="decimal"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">When you bought it</Label>
              <Input
                type="date"
                value={notes.purchased_at}
                onChange={(e) => onChange({ ...notes, purchased_at: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SellerPurchaseNotesCard({
  listing,
  className,
}: {
  listing: Record<string, unknown>;
  className?: string;
}) {
  if (!hasCollectionPurchaseNotes(listing)) return null;

  const notes = collectionPurchaseNotesFromListing(listing);
  const priceLabel = notes.purchase_price_dollars
    ? `$${Number(notes.purchase_price_dollars).toLocaleString()}`
    : null;
  const dateLabel = notes.purchased_at
    ? new Date(`${notes.purchased_at}T12:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className={cn('rounded-xl border border-border bg-muted/20 p-4 space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground">Your purchase notes (private)</p>
      <dl className="space-y-1.5 text-sm">
        {notes.purchase_source ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</dt>
            <dd className="text-foreground">{notes.purchase_source}</dd>
          </div>
        ) : null}
        {priceLabel ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Paid</dt>
            <dd className="text-foreground">{priceLabel}</dd>
          </div>
        ) : null}
        {dateLabel ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Purchased</dt>
            <dd className="text-foreground">{dateLabel}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
