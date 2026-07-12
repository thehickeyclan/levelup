'use client';

import { ClipboardCheck } from 'lucide-react';
import {
  CONDITION_BREAKDOWN_KEYS,
  gradeDisplay,
  type ListingConditionRead,
} from '@/lib/market/listing-condition-read';

export function ListingConditionReadSection({
  read,
  sellerView = false,
}: {
  read: ListingConditionRead;
  sellerView?: boolean;
}) {
  const showBreakdown =
    sellerView && CONDITION_BREAKDOWN_KEYS.some((key) => read.breakdown[key]?.score != null);
  const showSummary = Boolean(read.summary?.trim()) && !sellerView;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardCheck className="h-4 w-4 text-accent shrink-0" />
          <span>{sellerView ? 'Condition assessment' : 'Condition read'}</span>
        </div>
        <p className="text-sm text-foreground">
          <span className="text-lg font-bold text-accent">{read.wrestle_score.toFixed(1)}</span>
          <span className="text-muted-foreground"> / 10</span>
          <span className="text-muted-foreground mx-1.5">·</span>
          <span className="font-medium">{gradeDisplay(read.grade)}</span>
        </p>
      </div>

      {showBreakdown ? (
        <div className="grid grid-cols-4 gap-2">
          {CONDITION_BREAKDOWN_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-lg bg-muted border border-border px-2 py-2 text-center"
            >
              <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
              <p className="text-sm font-semibold">{read.breakdown[key]?.score ?? '—'}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showSummary ? (
        <p className="text-sm text-foreground/85 leading-relaxed">{read.summary}</p>
      ) : null}

      {sellerView && read.listing_tip ? (
        <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground block mb-1">
            Listing tip
          </span>
          {read.listing_tip}
        </p>
      ) : null}
    </div>
  );
}
