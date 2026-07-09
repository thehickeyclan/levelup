import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import { HomeHeroLogo } from '@/app/home-hero-logo';
import type { FeaturedCoachStrip } from '@/lib/home/fetch-featured-coaches';

type Props = {
  coaches: FeaturedCoachStrip[];
  logoSrc?: string;
  logoAlt?: string;
};

export function HomeHero({ coaches, logoSrc, logoAlt }: Props) {
  return (
    <section className="relative flex flex-col items-center justify-center bg-black px-6 py-8 sm:min-h-[65svh] sm:py-12">
      {logoSrc && (
        <div className="mb-4 sm:mb-8">
          <HomeHeroLogo
            src={logoSrc}
            alt={logoAlt ?? 'The Wrestling Guild'}
            className="mx-auto h-auto w-full max-w-[240px] object-contain sm:max-w-[min(90vw,360px)] md:max-w-[400px]"
          />
        </div>
      )}

      <h1 className="mb-3 max-w-3xl text-center font-serif text-2xl font-black uppercase leading-snug tracking-wide text-accent sm:text-4xl md:text-5xl">
        <span className="block">Connecting youth & high school wrestlers</span>
        <span className="block">to elite coaches in your community.</span>
      </h1>
      <p className="mb-8 max-w-xl text-center text-sm text-white/70 sm:text-base">
        NCAA and Division I backgrounds from programs you know — private sessions, partner
        training, and small groups where you live.
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md">
        <Button size="lg" variant="premium" asChild className="min-h-[44px] w-full">
          <Link href="/login">Login</Link>
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
      <p className="mt-5 text-center text-sm text-white/55">
        Division I wrestler or elite coach?{' '}
        <Link href="/coaches" className="font-semibold text-accent hover:underline">
          Apply to coach →
        </Link>
      </p>

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
