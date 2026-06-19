import Link from 'next/link';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import { StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui/badge';
import { getSchoolBadgeColors, schoolBadgeClassName } from '@/lib/school-logos';
import type { FeaturedCoachCard } from '@/lib/home/fetch-featured-coaches';

function coachMetaLine(coach: FeaturedCoachCard): string {
  const parts: string[] = [coach.school];
  if (coach.weightClass) parts.push(`${coach.weightClass} lbs`);
  if (coach.year) parts.push(coach.year);
  return parts.join(' · ');
}

function truncateReview(text: string, max = 100): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function HomeCoachCard({ coach }: { coach: FeaturedCoachCard }) {
  const schoolColors = getSchoolBadgeColors(coach.school);
  const displayName = `${coach.firstName} ${coach.lastName}`.trim();

  return (
    <article className="flex w-[78vw] max-w-[300px] shrink-0 snap-center flex-col overflow-hidden rounded-xl border border-accent/30 bg-zinc-950/80 md:w-auto md:max-w-none">
      <Link href={`/athlete/${coach.id}`} className="block">
        <ProfileImage
          src={coach.photoUrl}
          alt={displayName}
          focusX={coach.photoFocusX}
          focusY={coach.photoFocusY}
          rounded="none"
          fit="cover"
          className="aspect-[3/4] w-full bg-zinc-900"
          fallbackIconClassName="h-16 w-16 text-white/30"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <Link href={`/athlete/${coach.id}`} className="hover:underline">
            <h3 className="font-semibold text-white">{displayName}</h3>
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/60">
            <SchoolLogo school={coach.school} size="sm" />
            <Badge className={schoolBadgeClassName(schoolColors, 'text-xs')}>{coachMetaLine(coach)}</Badge>
          </div>
        </div>

        <StarRating
          averageRating={coach.averageRating}
          reviewCount={coach.reviewCount}
          size="sm"
        />

        <p className="text-xs text-white/50">
          {coach.sessionCount} {coach.sessionCount === 1 ? 'session' : 'sessions'} completed
        </p>

        {coach.featuredReview && (
          <blockquote className="text-sm italic text-white/75">
            &ldquo;{truncateReview(coach.featuredReview)}&rdquo;
          </blockquote>
        )}

        <Link
          href={`/athlete/${coach.id}`}
          className="mt-auto pt-2 text-sm font-semibold text-accent hover:underline"
        >
          View Profile →
        </Link>
      </div>
    </article>
  );
}

type Props = {
  coaches: FeaturedCoachCard[];
};

export function MeetCoachesSection({ coaches }: Props) {
  if (!coaches.length) return null;

  return (
    <section className="border-t border-accent/20 bg-black px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          Meet the Guild coaches
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/60">
          NCAA athletes and elite coaches — real credentials, real results.
        </p>

        <div className="-mx-2 mt-8 flex gap-4 overflow-x-auto px-2 pb-2 snap-x snap-mandatory scrollbar-none md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-3">
          {coaches.map((coach) => (
            <HomeCoachCard key={coach.id} coach={coach} />
          ))}
        </div>

        <p className="mt-8 text-center">
          <Link href="/browse" className="text-sm font-semibold text-accent hover:underline">
            Browse All Coaches →
          </Link>
        </p>
      </div>
    </section>
  );
}
