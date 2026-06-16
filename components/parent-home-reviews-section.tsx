'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { ParentHomeReviewSheet, type ReviewSessionPayload } from '@/components/parent-home-review-sheet';

type YouthOption = { id: string; first_name?: string; last_name?: string };

export function ParentHomeReviewsSection({
  sessions,
  youthWrestlers,
}: {
  sessions: ReviewSessionPayload[];
  youthWrestlers: YouthOption[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState<ReviewSessionPayload | null>(null);
  const [visible, setVisible] = useState<ReviewSessionPayload[]>(sessions);

  const dismiss = async (s: ReviewSessionPayload) => {
    const coachId = s.athlete_id?.trim();
    if (coachId) {
      try {
        const res = await fetch('/api/parent/reviews/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ athleteId: coachId }),
        });
        if (!res.ok) return;
      } catch {
        return;
      }
    }
    setVisible((prev) => prev.filter((x) => x.id !== s.id));
    if (active?.id === s.id) {
      setSheetOpen(false);
      setActive(null);
    }
  };

  if (visible.length === 0) return null;

  return (
    <section className="px-4 mb-6" aria-label="Needs review">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Needs Review</h2>
      <div className="space-y-3">
        {visible.map((s) => {
          const coach = s.athletes;
          const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() : 'Coach';
          const typeLabel = getSessionTypeDisplay(s.session_type ?? null, s.session_mode ?? null).label;
          const dt = new Date(s.scheduled_datetime);
          const athleteLine =
            s.attendingAthletes.length === 0
              ? null
              : s.attendingAthletes.length === 1
                ? `${[s.attendingAthletes[0].first_name, s.attendingAthletes[0].last_name].filter(Boolean).join(' ') || 'Athlete'} attended`
                : `${s.attendingAthletes.map((a) => a.first_name).filter(Boolean).join(', ')} attended`;

          return (
            <div
              key={s.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-foreground min-w-0">
                <span className="font-semibold">{formatEST(dt, 'MMM d')}</span>
                {' · '}
                {typeLabel} with {coachName}
              </p>
              <button
                type="button"
                onClick={() => dismiss(s)}
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-foreground touch-manipulation"
                aria-label="Dismiss review reminder"
              >
                <X className="h-5 w-5" />
              </button>
              </div>
              {athleteLine ? <p className="text-sm text-zinc-400">{athleteLine}</p> : null}
              <Button
                type="button"
                className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-semibold gap-2"
                onClick={() => {
                  setActive(s);
                  setSheetOpen(true);
                }}
              >
                <Star className="h-4 w-4" />
                Leave a Review
              </Button>
            </div>
          );
        })}
      </div>
      <ParentHomeReviewSheet
        session={active}
        youthWrestlers={youthWrestlers}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setActive(null);
        }}
      />
    </section>
  );
}
