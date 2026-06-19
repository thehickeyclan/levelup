'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import type { HomeReview, HomeReviewStats } from '@/lib/home/fetch-home-reviews';

type Props = {
  reviews: HomeReview[];
  stats: HomeReviewStats;
};

function ReviewCard({ review }: { review: HomeReview }) {
  const coachName = `${review.coachFirstName} ${review.coachLastName}`.trim();

  return (
    <article className="w-full shrink-0 snap-center rounded-xl border border-accent/25 bg-zinc-950/80 p-6 md:px-8">
      <div className="mb-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i <= review.rating ? 'fill-accent text-accent' : 'text-white/20'}`}
          />
        ))}
      </div>
      <blockquote className="mb-6 text-sm italic leading-relaxed text-white/85 sm:text-base">
        &ldquo;{review.comment}&rdquo;
      </blockquote>
      <div className="flex items-center gap-3">
        <ProfileImage
          src={review.coachPhoto}
          alt={coachName}
          className="h-8 w-8 border border-accent/30"
          fallbackIconClassName="h-4 w-4 text-white/40"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-white/60">
          <span>
            Session with{' '}
            <Link
              href={`/athlete/${review.coachId}`}
              className="text-white/80 hover:text-accent hover:underline"
            >
              {coachName}
            </Link>
          </span>
          {review.coachSchool && (
            <>
              <span aria-hidden>·</span>
              <SchoolLogo school={review.coachSchool} size="sm" />
              <span>{review.coachSchool}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function ParentReviewsCarousel({ reviews, stats }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (reviews.length === 0) return null;

  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.9;
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  const statParts: string[] = [];
  if (stats.sessionCount > 0) {
    statParts.push(`${stats.sessionCount} sessions`);
  }
  if (stats.coachCount > 0) {
    statParts.push(`${stats.coachCount} coaches`);
  }
  if (stats.stateCount > 0) {
    statParts.push(`${stats.stateCount} ${stats.stateCount === 1 ? 'state' : 'states'}`);
  }
  if (stats.avgRating > 0) {
    statParts.push(`${stats.avgRating} avg rating`);
  }

  return (
    <section className="border-t border-accent/20 bg-black px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          What parents say
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/60">
          Real feedback from families across North Carolina.
        </p>

        {statParts.length > 0 && (
          <p className="mt-4 text-center text-xs font-medium uppercase tracking-wider text-white/45">
            {statParts.join(' · ')}
          </p>
        )}

        <div className="relative mt-8">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none"
          >
            {reviews.map((review) => (
              <div key={review.id} className="w-full min-w-full shrink-0 snap-center">
                <ReviewCard review={review} />
              </div>
            ))}
          </div>

          {reviews.length > 1 && (
            <div className="mt-4 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => scroll(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/40 text-accent hover:bg-accent/10"
                aria-label="Previous review"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scroll(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/40 text-accent hover:bg-accent/10"
                aria-label="Next review"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
