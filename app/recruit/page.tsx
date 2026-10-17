import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canViewRecruitingPages } from '@/lib/guild-recruiting-access';
import { RECRUIT_LINKS, RECRUITING_STATES } from '@/lib/guild-recruiting';
import { IntegrityRule, RecruitButton } from './recruit-ui';

export const dynamic = 'force-dynamic';

/**
 * Hidden until launch: 404 for everyone but admins, and never indexed.
 * Metadata resolves BEFORE the page body's notFound(), so the access check
 * must run here too — otherwise the 404 would still carry the product name
 * in <title>/og tags, which is exactly the leak the hold rule forbids.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await canViewRecruitingPages())) return {};
  return {
    title: 'Guild Recruiting | College recruiting, built on verified results',
    robots: { index: false, follow: false },
  };
}

const FAMILY_FEATURES = [
  ['A recruiting plan by grade', 'Know what to do freshman year through signing day.'],
  ['A college list with full cost and fit', 'Real numbers, not sticker price.'],
  ['Every college program on one map', 'Every division, every state.'],
  ['Compare colleges side by side', 'Roster, academics, cost, location.'],
  ['Ready-to-send coach emails', 'Introductions written and timed for you.'],
  ['See who viewed the profile', 'Know which programs are watching.'],
  ['Messages from coaches', 'Contact happens on the platform, parents see all of it.'],
  ['Learn guides', 'The rules, the timelines, the terms — explained.'],
] as const;

const COACH_FEATURES = [
  ['Search every wrestler', 'Filtered by the weight they last competed at.'],
  ['Prospect rankings', 'Based on verified results, never purchases.'],
  ['Scouting reports', 'A computed report on every prospect.'],
  ['One shared board for the staff', 'A recruiting funnel the whole room works from.'],
  ['Message families directly', 'No chasing cell numbers.'],
  ['Compare two wrestlers', 'Head-to-head résumés in one view.'],
  ['“Perfect recruit” matching', 'Tell it what you need; it finds who fits.'],
] as const;

export default async function RecruitLandingPage() {
  if (!(await canViewRecruitingPages())) notFound();

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="container mx-auto px-4 pt-14 pb-16 text-center">
        <Image
          src="/logos/guild-logo-hero.png"
          alt="Guild Recruiting"
          width={280}
          height={256}
          priority
          className="mx-auto mb-8 h-auto w-[220px] sm:w-[280px]"
        />
        <h1 className="font-serif text-4xl sm:text-5xl font-bold text-accent max-w-3xl mx-auto">
          College recruiting, built on verified results.
        </h1>
        <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
          Where college wrestling coaches find athletes, and families run the recruiting process.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4">
          <RecruitButton href={RECRUIT_LINKS.createProfile}>
            Wrestlers &amp; parents — find your profile
          </RecruitButton>
          <RecruitButton href={RECRUIT_LINKS.coachSignup} variant="outline">
            College coaches — create a free coach account
          </RecruitButton>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Already on it?{' '}
          <Link href={RECRUIT_LINKS.signIn} className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </section>

      {/* The difference */}
      <section className="border-y border-border bg-white/[0.02]">
        <div className="container mx-auto px-4 py-14 text-center max-w-3xl">
          <h2 className="font-serif text-3xl font-bold text-white">College coaches work here.</h2>
          <p className="mt-4 text-white/80 leading-relaxed">
            Coaches search, track, and contact athletes on the same platform families use. Families
            see which programs viewed them and log who reached out. No middleman, no mailing lists —
            the two sides of recruiting, finally in one place.
          </p>
        </div>
      </section>

      {/* For families */}
      <section className="container mx-auto px-4 py-14">
        <h2 className="font-serif text-3xl font-bold text-accent text-center">
          For families: the Command Center
        </h2>
        <p className="mt-3 text-center text-white/70 max-w-2xl mx-auto">
          Everything the recruiting process asks of a family, in one place.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
          {FAMILY_FEATURES.map(([title, detail]) => (
            <div key={title} className="rounded-lg border border-border bg-white/[0.03] p-5">
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-white/60">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For college coaches */}
      <section className="border-y border-border bg-white/[0.02]">
        <div className="container mx-auto px-4 py-14">
          <h2 className="font-serif text-3xl font-bold text-accent text-center">
            For college coaches
          </h2>
          <p className="mt-3 text-center text-white/70">Free for college coaching staff.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {COACH_FEATURES.map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-border bg-white/[0.03] p-5">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-white/60">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <RecruitButton href={RECRUIT_LINKS.coachSignup}>Create a free coach account</RecruitButton>
          </div>
        </div>
      </section>

      {/* State by state */}
      <section className="container mx-auto px-4 py-14 text-center">
        <h2 className="font-serif text-3xl font-bold text-white">State by state</h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {RECRUITING_STATES.map((state) => (
            <Link
              key={state.code}
              href={`/recruit/${state.code}`}
              className="rounded-lg border border-border bg-white/[0.03] px-6 py-4 hover:border-accent transition-colors"
            >
              <span className="font-serif font-bold text-xl">
                <span className="text-white">RECRUIT</span>
                <span className="text-accent">{state.code.toUpperCase()}</span>
              </span>
              <span className="block mt-1 text-xs text-muted-foreground">
                {state.name}
                {state.live ? '' : ' — coming soon'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Integrity rule */}
      <section className="container mx-auto px-4 pb-16 max-w-3xl">
        <IntegrityRule />
      </section>
    </main>
  );
}
