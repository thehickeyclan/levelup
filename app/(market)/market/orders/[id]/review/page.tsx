'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';

const TAG_OPTIONS = ['As described', 'Fast shipping', 'Great communication', 'Would buy again'];

export default function MarketOrderReviewPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [existingRating, setExistingRating] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/market/orders/${orderId}/review`)
      .then((r) => r.json())
      .then((d) => {
        setCanReview(Boolean(d.canReview));
        if (d.review?.rating) {
          setExistingRating(d.review.rating);
          setRating(d.review.rating);
          setComment(d.review.comment || '');
          setTags(d.review.tags || []);
        }
      });
  }, [orderId]);

  const display = hover || rating;

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 4 ? [...prev, tag] : prev
    );
  };

  const submit = async () => {
    if (rating < 1) {
      setError('Select a star rating.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      router.push('/market/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market/orders" label="Back to orders" />
      <h1 className="text-2xl font-bold">Rate your seller</h1>
      <p className="text-sm text-muted-foreground">
        Your feedback helps other wrestling parents buy with confidence — like eBay seller ratings.
      </p>

      {existingRating && !canReview ? (
        <p className="text-sm text-green-600">Thanks — you already left feedback for this order.</p>
      ) : null}

      {!canReview && !existingRating ? (
        <p className="text-sm text-muted-foreground">Feedback unlocks when the order is marked completed.</p>
      ) : null}

      {(canReview || existingRating) ? (
        <div className="space-y-4">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                disabled={!canReview}
                className="p-1"
                onMouseEnter={() => canReview && setHover(i)}
                onMouseLeave={() => setHover(0)}
                onClick={() => canReview && setRating(i)}
              >
                <Star
                  className={`h-8 w-8 ${i <= display ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
                />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={!canReview}
                onClick={() => toggleTag(tag)}
                className={`text-xs rounded-full border px-3 py-1 ${
                  tags.includes(tag) ? 'border-accent text-accent' : 'border-border text-muted-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Optional comment for other buyers"
            value={comment}
            disabled={!canReview}
            onChange={(e) => setComment(e.target.value)}
          />

          {canReview ? (
            <Button
              className="w-full bg-accent text-accent-foreground font-semibold"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit feedback'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Link href="/market/orders" className="text-sm text-accent hover:underline block">
        Back to orders
      </Link>
    </div>
  );
}
