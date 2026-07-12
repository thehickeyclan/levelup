'use client';

import { Sparkles } from 'lucide-react';
import {
  CONDITION_BREAKDOWN_KEYS,
  gradeDisplay,
  type ListingConditionRead,
} from '@/lib/market/listing-condition-read';

export function ListingConditionReadSection({ read }: { read: ListingConditionRead }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">
        Condition on this pair
      </h3>
      <p className="text-xs text-muted-foreground">
        AI read of the photos on this listing — not the model in general.
      </p>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>AI condition read</span>
          </div>
          <span className="text-lg font-bold text-accent">{read.wrestle_score.toFixed(1)} / 10</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Suggested grade: <span className="text-foreground font-medium">{gradeDisplay(read.grade)}</span>
        </p>
        <div className="border-t border-border" />
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_BREAKDOWN_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-lg bg-muted border border-border px-3 py-2 text-center"
            >
              <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
              <p className="text-sm font-semibold">{read.breakdown[key]?.score ?? '—'}</p>
            </div>
          ))}
        </div>
        {read.summary ? (
          <>
            <div className="border-t border-border" />
            <p className="text-sm text-foreground/85 leading-relaxed">{read.summary}</p>
          </>
        ) : null}
        {read.listing_tip ? (
          <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">{read.listing_tip}</p>
        ) : null}
        <p className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" />
          AI photo analysis on this listing
        </p>
      </div>
    </section>
  );
}
