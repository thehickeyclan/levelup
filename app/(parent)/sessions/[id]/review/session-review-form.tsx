'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Loader2, CheckCircle } from 'lucide-react';
import { BackLink } from '@/components/back-link';

const TAG_OPTIONS = ['Technique', 'Great with kids', 'Punctual', 'Communication', 'My kid loved it'];

export function SessionReviewForm({
  sessionId,
  coachId,
  coachName,
  existingReview,
}: {
  sessionId: string;
  coachId: string;
  coachName: string;
  existingReview: { rating: number; comment: string; tags: string[] } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(existingReview?.comment ?? '');
  const [tags, setTags] = useState<string[]>(existingReview?.tags ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          rating,
          comment: comment.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      setSubmitted(true);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  if (submitted) {
    return (
      <Card className="border-green-600/30 bg-green-500/5">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="rounded-full bg-green-600/20 p-3">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Thanks! Your feedback was saved.</h2>
              <p className="text-muted-foreground text-sm">
                Your stars and review are now on the coach&apos;s profile for other parents to see.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {coachId ? (
                <Button asChild variant="default" size="lg" className="gap-2">
                  <Link href={`/athlete/${coachId}`}>
                    <Star className="h-4 w-4 fill-current" />
                    View on {coachName}&apos;s profile
                  </Link>
                </Button>
              ) : null}
              <BackLink
                fallbackHref="/bookings"
                label="Back to My bookings"
                className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your feedback</CardTitle>
        <CardDescription>
          Your review will be shown on the coach&apos;s profile (star rating at the top and in the &quot;What parents say&quot; section below). Stars are required; your own words are optional but help other parents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">Rating *</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-accent"
                  aria-label={`${i} star${i > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      i <= displayRating ? 'fill-accent text-accent' : 'text-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="review-comment" className="text-sm font-medium mb-2 block">
              Your own words (optional)
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you or your wrestler appreciate? Anything that stood out?"
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground mt-1">{comment.length}/1000</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Quick tags (optional)</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    tags.includes(tag)
                      ? 'bg-accent text-primary border-accent'
                      : 'border-input hover:bg-muted'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={submitting || rating < 1}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting…
                </>
              ) : existingReview ? (
                'Update feedback'
              ) : (
                'Submit feedback'
              )}
            </Button>
            {!existingReview ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting}
                onClick={() => router.push('/bookings')}
              >
                Not now
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
