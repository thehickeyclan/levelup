import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import type { FeaturedCoachStrip } from '@/lib/home/fetch-featured-coaches';

type Props = {
  coaches: FeaturedCoachStrip[];
};

export function HomeHero({ coaches }: Props) {
  return (
    <section className="relative flex min-h-[65svh] flex-col items-center justify-center bg-black px-6 py-10 sm:py-12">
      <h1 className="mb-3 max-w-3xl text-center font-serif text-3xl font-black uppercase tracking-wide text-accent sm:text-4xl md:text-5xl">
        Division I wrestling,
        <br className="sm:hidden" /> in your community.
      </h1>
      <p className="mb-8 max-w-xl text-center text-sm text-white/70 sm:text-base">
        NCAA athletes and elite coaches from programs you know — training kids where you live.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md">
        <Button size="lg" variant="premium" asChild className="min-h-[44px] w-full">
          <Link href="/training?tab=coaches">Browse Coaches</Link>
        </Button>
        <Button
          size="lg"
          variant="outline"
          asChild
          className="min-h-[44px] w-full border-2 border-accent/60 text-accent hover:bg-accent/10"
        >
          <Link href="/signup">Sign Up Free</Link>
        </Button>
      </div>

      {coaches.length > 0 && (
        <div className="mt-8 w-full max-w-4xl">
          <div className="flex gap-4 overflow-x-auto px-1 pb-2 snap-x snap-mandatory scrollbar-none sm:justify-center sm:overflow-visible">
            {coaches.map((coach) => (
              <Link
                key={coach.id}
                href={`/athlete/${coach.id}`}
                className="relative shrink-0 snap-center sm:shrink"
                aria-label={`View ${coach.firstName}'s profile`}
              >
                <ProfileImage
                  src={coach.photoUrl}
                  alt={coach.firstName}
                  focusX={coach.photoFocusX}
                  focusY={coach.photoFocusY}
                  className="h-20 w-20 border-2 border-accent/30"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-black/50 bg-black/80">
                  <SchoolLogo school={coach.school} size="sm" className="h-5 w-5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
