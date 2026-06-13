'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Star, Loader2 } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';

export type ReviewSessionPayload = {
  id: string;
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  athlete_id?: string | null;
  athletes?: { first_name?: string; last_name?: string } | null;
  /** Youth wrestlers on this session that belong to parent (for multi-kid picker) */
  attendingAthletes: { id: string; first_name?: string; last_name?: string }[];
};

type YouthOption = { id: string; first_name?: string; last_name?: string };

export function ParentHomeReviewSheet({
  session,
  youthWrestlers,
  open,
  onOpenChange,
}: {
  session: ReviewSessionPayload | null;
  youthWrestlers: YouthOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [athleteId, setAthleteId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  const coach = session?.athletes;
  const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() : 'Coach';
  const typeLabel = session
    ? getSessionTypeDisplay(session.session_type ?? null, session.session_mode ?? null).label
    : '';
  const when = session
    ? `${formatEST(new Date(session.scheduled_datetime), 'MMM d')} · ${typeLabel} with ${coachName}`
    : '';

  const needsAthletePick = (session?.attendingAthletes.length ?? 0) > 1;
  const displayAthletes =
    session && session.attendingAthletes.length > 0 ? session.attendingAthletes : youthWrestlers;

  const reset = () => {
    setRating(0);
    setHover(0);
    setComment('');
    setAthleteId('');
    setError(null);
    setThanks(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (rating < 1 || rating > 5) {
      setError('Please choose a star rating.');
      return;
    }
    if (needsAthletePick && !athleteId) {
      setError('Select which athlete attended.');
      return;
    }
    const c = comment.trim();
    if (c.length > 500) {
      setError('Review text must be 500 characters or less.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          rating,
          comment: c || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Something went wrong');
        return;
      }
      setThanks(true);
      router.refresh();
      window.setTimeout(() => {
        handleOpenChange(false);
      }, 1200);
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const stars = hover || rating;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={
          'max-md:fixed max-md:left-0 max-md:right-0 max-md:top-auto max-md:bottom-0 max-md:translate-x-0 max-md:translate-y-0 ' +
          'max-md:w-full max-md:max-w-none max-md:rounded-t-2xl max-md:rounded-b-none max-md:pb-8 ' +
          'max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom ' +
          'max-md:data-[state=open]:zoom-in-100 max-md:data-[state=closed]:zoom-out-100'
        }
      >
        {thanks ? (
          <p className="text-center text-lg font-medium text-foreground py-6">Thanks for your review!</p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-left">Leave a review</DialogTitle>
              <DialogDescription className="text-left text-base text-foreground/90">
                {when}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-5 pt-2">
              {needsAthletePick ? (
                <div className="space-y-2">
                  <Label htmlFor="review-athlete">Which athlete attended?</Label>
                  <Select value={athleteId || undefined} onValueChange={setAthleteId}>
                    <SelectTrigger id="review-athlete" className="min-h-[44px] w-full">
                      <SelectValue placeholder="Select athlete" />
                    </SelectTrigger>
                    <SelectContent>
                      {displayAthletes.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {[a.first_name, a.last_name].filter(Boolean).join(' ') || 'Athlete'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium mb-2">Rating</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="min-h-[48px] min-w-[48px] p-0 flex items-center justify-center rounded-md touch-manipulation"
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(n)}
                      aria-label={`${n} stars`}
                    >
                      <Star
                        className={`h-10 w-10 ${n <= stars ? 'fill-accent text-accent' : 'text-zinc-600'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="review-comment">Tell other parents about this session (optional)</Label>
                <textarea
                  id="review-comment"
                  maxLength={500}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What stood out?"
                />
                <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] bg-accent hover:bg-accent-hover text-black font-semibold"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
