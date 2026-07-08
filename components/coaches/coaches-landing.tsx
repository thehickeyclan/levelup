import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ProfileImage } from '@/components/profile-image';
import { SchoolLogo } from '@/components/school-logo';
import { Badge } from '@/components/ui/badge';
import { getSchoolBadgeColors, schoolBadgeClassName } from '@/lib/school-logos';
import { coachRevenueSharePercentDisplay } from '@/lib/pricing';
import type { HomeReview } from '@/lib/home/fetch-home-reviews';
import type {
  CoachesBySchool,
  CoachesEarningsExample,
  CoachesEarningsScenario,
  CoachesLandingCoach,
  CoachesLandingStats,
  CoachesRecentActivity,
} from '@/lib/coaches-landing';
import {
  formatBookingDollarsStat,
  formatCountStat,
} from '@/lib/coaches-landing';
import { CoachesPracticeVideo } from '@/components/coaches/coaches-practice-video';
import {
  Calendar,
  Check,
  ChevronDown,
  CreditCard,
  MapPin,
  Shield,
  Star,
  X,
} from 'lucide-react';

const PRACTICE_PHOTOS = [
  {
    src: '/coaches/practice/guild-coaching.png',
    alt: 'Guild coach demonstrating technique on the mat',
    label: 'Guild sessions',
  },
  {
    src: '/coaches/practice/unc-coaching.png',
    alt: 'One-on-one coaching in a Division I wrestling room',
    label: 'Division I rooms',
  },
  {
    src: '/coaches/practice/ncstate-huddle.png',
    alt: 'Small group session at NC State',
    label: 'Small groups',
  },
  {
    src: '/coaches/practice/app-state-team.png',
    alt: 'Athletes training at Appalachian State',
    label: 'Club & college',
  },
] as const;

const FAQ_ITEMS = [
  {
    q: 'Can I coach if I\'m still competing?',
    a: 'Yes — many of our coaches are current NCAA athletes. You set availability around your competition and academic schedule.',
  },
  {
    q: 'Who can apply to coach?',
    a: 'We review every application — The Guild is curated, not open enrollment. Current and former NCAA, NAIA, and JUCO wrestlers; national and state placers; and proven club or high school coaches are welcome. Coaches in any location can apply. Once approved, you set your own rates and schedule where you train.',
  },
  {
    q: 'Can I set my own prices?',
    a: 'Yes. You build your rate card — private, partner, and small-group pricing, session length, and what you offer. Recommended rates are shown when you onboard.',
  },
  {
    q: 'How do I get paid?',
    a: 'Parents pay securely at checkout on The Guild. We send weekly payouts directly to you via Venmo or Zelle. You keep about 80% of what the parent pays.',
  },
  {
    q: 'Can I only run privates?',
    a: 'We ask coaches to offer private, partner, and small-group formats so parents can choose what fits. You control your schedule and how often you open each type.',
  },
  {
    q: 'Do I need liability insurance?',
    a: 'You are an independent contractor and responsible for your own coverage. Many coaches are already covered through their school, club, or personal policy.',
  },
  {
    q: 'How long does approval take?',
    a: 'Most applications are reviewed within 24–48 hours. You\'ll get an email when you\'re approved and can open your calendar.',
  },
];

type Props = {
  coaches: CoachesLandingCoach[];
  bySchool: CoachesBySchool[];
  stats: CoachesLandingStats;
  recentActivity: CoachesRecentActivity;
  featuredCoaches: CoachesLandingCoach[];
  earningsExamples: CoachesEarningsExample[];
  earningsScenarios: CoachesEarningsScenario[];
  reviews: HomeReview[];
  coachSharePercent: number;
};

function FeaturedCoachCard({ coach }: { coach: CoachesLandingCoach }) {
  const displayName = `${coach.firstName} ${coach.lastName}`.trim();
  const schoolColors = getSchoolBadgeColors(coach.school);

  return (
    <article className="group relative shrink-0 snap-center overflow-hidden rounded-2xl border border-accent/30 bg-zinc-950 transition-all duration-300 hover:border-accent/60 hover:shadow-lg hover:shadow-accent/10 w-[200px] sm:w-[220px] md:w-[240px]">
      <Link href={`/athlete/${coach.id}`} className="block">
        <ProfileImage
          src={coach.photoUrl}
          alt={displayName}
          focusX={coach.photoFocusX}
          focusY={coach.photoFocusY}
          rounded="none"
          fit="cover"
          className="aspect-[3/4] w-full bg-zinc-900 transition-transform duration-500 group-hover:scale-[1.03]"
          fallbackIconClassName="h-16 w-16 text-white/30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-serif text-lg font-bold text-white">{displayName}</h3>
          <div className="mt-1.5 flex items-center gap-1.5">
            <SchoolLogo school={coach.school} size="sm" />
            <Badge className={schoolBadgeClassName(schoolColors, 'text-[10px] px-1.5 py-0')}>
              {coach.schoolLabel}
            </Badge>
          </div>
          {coach.sessionCount > 0 && (
            <p className="mt-1 text-xs text-white/55">
              {coach.sessionCount} sessions completed
            </p>
          )}
          <span className="mt-2 inline-block text-sm font-semibold text-accent group-hover:underline">
            View Profile →
          </span>
        </div>
      </Link>
    </article>
  );
}

function CoachCard({ coach }: { coach: CoachesLandingCoach }) {
  const displayName = `${coach.firstName} ${coach.lastName}`.trim();
  const meta: string[] = [];
  if (coach.weightClass) meta.push(`${coach.weightClass} lbs`);
  if (coach.year) meta.push(coach.year);
  const schoolColors = getSchoolBadgeColors(coach.school);

  return (
    <article className="group overflow-hidden rounded-xl border border-accent/25 bg-zinc-950/90 transition-colors hover:border-accent/50">
      <Link href={`/athlete/${coach.id}`} className="block">
        <ProfileImage
          src={coach.photoUrl}
          alt={displayName}
          focusX={coach.photoFocusX}
          focusY={coach.photoFocusY}
          rounded="none"
          fit="cover"
          className="aspect-[3/4] w-full bg-zinc-900 transition-transform duration-300 group-hover:scale-[1.02]"
          fallbackIconClassName="h-16 w-16 text-white/30"
        />
      </Link>
      <div className="space-y-2 p-4">
        <Link href={`/athlete/${coach.id}`} className="hover:underline">
          <h3 className="font-semibold text-white">{displayName}</h3>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <SchoolLogo school={coach.school} size="sm" />
          <Badge className={schoolBadgeClassName(schoolColors, 'text-xs')}>
            {coach.schoolLabel}
            {meta.length > 0 ? ` · ${meta.join(' · ')}` : ''}
          </Badge>
        </div>
        {coach.sessionCount > 0 && (
          <p className="text-xs text-white/50">
            {coach.sessionCount} {coach.sessionCount === 1 ? 'session' : 'sessions'} completed
          </p>
        )}
        <Link
          href={`/athlete/${coach.id}`}
          className="inline-block text-sm font-semibold text-accent hover:underline"
        >
          View Profile →
        </Link>
      </div>
    </article>
  );
}

export function CoachesLanding({
  coaches,
  bySchool,
  stats,
  recentActivity,
  featuredCoaches,
  earningsExamples,
  earningsScenarios,
  reviews,
  coachSharePercent,
}: Props) {
  const bookingDollarsLabel = formatBookingDollarsStat(stats.bookingDollars);
  const bookingCountLabel = formatCountStat(stats.bookingCount);
  const sessionCountLabel = formatCountStat(stats.sessionCount);
  const showRecentActivity =
    recentActivity.privateCount > 0 ||
    recentActivity.groupCount > 0 ||
    recentActivity.athletesTrained > 0;

  return (
    <div className="bg-black text-white">
      {/* Hero — real Guild practice photography */}
      <section className="relative overflow-hidden border-b border-accent/20">
        <div className="absolute inset-0">
          <Image
            src="/coaches/practice/guild-coaching.png"
            alt=""
            fill
            className="object-cover object-center"
            sizes="100vw"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/85 to-black" />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 py-16 text-center sm:py-20 md:py-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
            For NCAA wrestlers &amp; elite coaches
          </p>
          <h1 className="max-w-3xl font-serif text-3xl font-black uppercase leading-tight tracking-wide text-white sm:text-4xl md:text-5xl">
            You Coach.
            <br />
            <span className="text-accent">We&apos;ll Handle Everything Else.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg">
            Set your own rates. Open your schedule. Parents book and pay online.
          </p>
          <p className="mt-3 max-w-lg text-sm text-white/55">
            Apply to join — we review every coach. Once approved, coach on your terms, anywhere you
            train.
          </p>
          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" variant="premium" asChild className="min-h-[48px] w-full sm:w-auto">
              <Link href="/signup/coach">Apply to Coach</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-[48px] w-full border-2 border-accent/60 text-accent hover:bg-accent/10 sm:w-auto"
            >
              <Link href="#meet-coaches">See Coach Profiles</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Founding Coach — scarcity first */}
      <section className="border-b border-accent/20 bg-accent/10 px-6 py-10 md:py-12">
        <div className="mx-auto max-w-3xl text-center">
          <Badge className="border-accent/40 bg-black/40 text-accent">Founding Coach</Badge>
          <h2 className="mt-4 font-serif text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
            Become a Founding Coach
          </h2>
          <p className="mt-3 text-sm text-white/75 sm:text-base">
            Limited to coaches approved before{' '}
            <strong className="text-white">September 1, 2026</strong>
          </p>
          <ul className="mx-auto mt-6 inline-flex flex-col items-start gap-2.5 text-left text-sm text-white/85 sm:text-base">
            {[
              'Featured placement at launch',
              'Locked-in platform fee',
              'Founding Coach badge on your profile',
              'Exclusive Guild apparel',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CoachesPracticeVideo />

      {/* Live social proof */}
      <section className="border-b border-accent/20 bg-zinc-950 px-6 py-8">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          <div className="text-center">
            <p className="font-serif text-3xl font-black text-accent md:text-4xl">
              {bookingDollarsLabel}
            </p>
            <p className="mt-1 text-sm text-white/60">in parent bookings</p>
          </div>
          <div className="text-center">
            <p className="font-serif text-3xl font-black text-accent md:text-4xl">
              {bookingCountLabel}
            </p>
            <p className="mt-1 text-sm text-white/60">athlete signups</p>
          </div>
          <div className="text-center">
            <p className="font-serif text-3xl font-black text-accent md:text-4xl">
              {sessionCountLabel}
            </p>
            <p className="mt-1 text-sm text-white/60">sessions completed</p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-sm text-white/50">
          Private · Partner · Small Groups
          {stats.coachCount > 0 ? (
            <>
              {' '}
              · {stats.coachCount} approved coaches · {coachSharePercent}% coach share
            </>
          ) : null}
        </p>
      </section>

      {/* Why coaches join */}
      <section className="border-b border-accent/20 bg-zinc-950/50 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            Why coaches join
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-accent/20 bg-black/40 p-6">
              <Calendar className="mb-4 h-10 w-10 text-accent" aria-hidden />
              <h3 className="text-lg font-semibold text-white">Coach more</h3>
              <p className="mt-2 text-sm text-white/65">
                Parents book online. No scheduling through DMs or group texts.
              </p>
            </div>
            <div className="rounded-xl border border-accent/20 bg-black/40 p-6">
              <CreditCard className="mb-4 h-10 w-10 text-accent" aria-hidden />
              <h3 className="text-lg font-semibold text-white">Get paid</h3>
              <p className="mt-2 text-sm text-white/65">
                Parents pay securely at checkout. Weekly payouts via Venmo or Zelle — you keep about{' '}
                {coachSharePercent}%.
              </p>
            </div>
            <div className="rounded-xl border border-accent/20 bg-black/40 p-6">
              <Shield className="mb-4 h-10 w-10 text-accent" aria-hidden />
              <h3 className="text-lg font-semibold text-white">Build your brand</h3>
              <p className="mt-2 text-sm text-white/65">
                Verified profile with your school, photos, credentials, and parent reviews.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pain → solution */}
      <section className="border-b border-accent/20 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            Built for coaches who already coach
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <ul className="space-y-3 text-white/70">
              {[
                'Group texts',
                'Venmo reminders',
                'Last-minute cancellations',
                'Scheduling screenshots',
                '"Can you train tomorrow?"',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <X className="h-5 w-5 shrink-0 text-red-400/90" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-3 text-white/90">
              {[
                'Parents book online',
                'Secure payment at checkout',
                'Your own schedule & rates',
                'Verified profile with school credentials',
                'Parent reviews on your profile',
                'Private, partner & small groups',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Earnings — scenarios + per-session examples */}
      <section id="earnings" className="border-b border-accent/20 bg-zinc-950/50 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            How much can I earn?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/65">
            You set your rates. Scenarios below use recommended pricing — you keep ~{coachSharePercent}
            % of what parents pay.
          </p>

          <div className="mt-10 overflow-hidden rounded-xl border border-accent/25">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-accent/20 bg-black/50">
                  <th className="px-4 py-3 font-semibold text-white/80 sm:px-6">Coach your way</th>
                  <th className="px-4 py-3 text-right font-semibold text-white/80 sm:px-6">
                    Approx. monthly earnings*
                  </th>
                </tr>
              </thead>
              <tbody>
                {earningsScenarios.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 === 0 ? 'bg-zinc-950/80' : 'bg-black/30'}
                  >
                    <td className="px-4 py-3.5 text-white/85 sm:px-6">{row.label}</td>
                    <td className="px-4 py-3.5 text-right font-serif text-lg font-bold text-accent sm:px-6">
                      ~${row.monthlyApprox.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-accent/15 px-4 py-2.5 text-xs text-white/45 sm:px-6">
              *Estimated coach payout based on typical Guild pricing. Your rates and schedule may
              vary.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {earningsExamples.map((ex) => (
              <div
                key={ex.title}
                className="rounded-xl border border-accent/30 bg-black/50 p-6 text-center"
              >
                <h3 className="font-serif text-xl font-bold text-white">{ex.title}</h3>
                <p className="mt-1 text-sm text-white/55">{ex.subtitle}</p>
                <p className="mt-6 font-serif text-3xl font-black text-accent">
                  You keep ~${ex.coachKeeps.toFixed(0)}
                </p>
                <p className="mt-1 text-xs text-white/45">${ex.parentTotal} collected from parents</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-accent/20 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { step: '1', title: 'Apply', body: 'Submit your background, bio, and payout info.' },
              { step: '2', title: 'Get approved', body: 'We review in 24–48 hours and verify your profile.' },
              { step: '3', title: 'Open your calendar', body: 'Set rates, post availability, and start booking.' },
            ].map((item) => (
              <li key={item.step} className="flex flex-col items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent font-serif text-xl font-black text-accent">
                  {item.step}
                </span>
                <h3 className="mt-4 font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-white/65">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who can coach */}
      <section id="who-can-coach" className="border-b border-accent/20 bg-zinc-950/50 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            Who can coach?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/70 sm:text-base">
            We review every application. The Guild is curated — not open enrollment — so parents
            know every coach on the platform is vetted.
          </p>
          <ul className="mt-8 space-y-3 text-white/85">
            {[
              'Current and former NCAA, NAIA, and JUCO wrestlers',
              'National and state placers with proven coaching experience',
              'Club and high school coaches with elite credentials',
              'Coaches in any location — train where you already coach',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-sm">
            <Link href="/requirements" className="text-accent hover:underline">
              See full requirements →
            </Link>
          </p>
        </div>
      </section>

      {/* Coach anywhere + practice photos */}
      <section className="border-b border-accent/20 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <MapPin className="mx-auto mb-4 h-10 w-10 text-accent" aria-hidden />
            <h2 className="font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
              Coach where you already train
            </h2>
            <p className="mt-4 text-sm text-white/70 sm:text-base">
              Whether you&apos;re coaching at a Division I room, your local club, a high school, or
              your own facility — The Guild gives parents one place to discover and book you.
            </p>
            <ul className="mx-auto mt-6 inline-flex flex-col items-start gap-2 text-left text-sm text-white/80">
              {[
                'Division I & college wrestling rooms',
                'Local club & training centers',
                'High school programs',
                'Your own facility',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {PRACTICE_PHOTOS.map((photo) => (
              <figure
                key={photo.src}
                className="group relative overflow-hidden rounded-xl border border-accent/20"
              >
                <div className="relative aspect-[4/5]">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <figcaption className="absolute bottom-0 left-0 right-0 p-3 text-xs font-semibold uppercase tracking-wide text-white/90">
                    {photo.label}
                  </figcaption>
                </div>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Who's already here — featured row + by school */}
      <section id="meet-coaches" className="border-b border-accent/20 bg-zinc-950/30 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            Who&apos;s already here
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/65">
            {coaches.length} approved coaches on The Guild — NCAA athletes and elite club coaches
            parents already book. We&apos;re growing nationwide, starting in North Carolina.
          </p>

          {featuredCoaches.length > 0 && (
            <div className="mt-10">
              <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-white/45">
                Most booked
              </p>
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
                {featuredCoaches.map((coach) => (
                  <FeaturedCoachCard key={coach.id} coach={coach} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-14 space-y-14">
            {bySchool.map((group) => (
              <div key={group.schoolLabel}>
                <div className="mb-6 flex items-center gap-3">
                  <SchoolLogo school={group.coaches[0]?.school ?? group.schoolLabel} size="lg" />
                  <h3 className="font-serif text-xl font-bold uppercase tracking-wide text-white md:text-2xl">
                    {group.schoolLabel}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {group.coaches.map((coach) => (
                    <CoachCard key={coach.id} coach={coach} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent activity — last 30 days */}
      {showRecentActivity && (
        <section className="border-b border-accent/20 bg-zinc-950 px-6 py-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">
              Last 30 days on The Guild
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {recentActivity.privateCount > 0 && (
                <div>
                  <p className="font-serif text-2xl font-black text-white md:text-3xl">
                    {formatCountStat(recentActivity.privateCount)}
                  </p>
                  <p className="mt-1 text-sm text-white/55">private lessons</p>
                </div>
              )}
              {recentActivity.groupCount > 0 && (
                <div>
                  <p className="font-serif text-2xl font-black text-white md:text-3xl">
                    {formatCountStat(recentActivity.groupCount)}
                  </p>
                  <p className="mt-1 text-sm text-white/55">small groups</p>
                </div>
              )}
              {recentActivity.athletesTrained > 0 && (
                <div>
                  <p className="font-serif text-2xl font-black text-white md:text-3xl">
                    {formatCountStat(recentActivity.athletesTrained)}
                  </p>
                  <p className="mt-1 text-sm text-white/55">athletes trained</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      <section className="border-b border-accent/20 bg-zinc-950/50 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            What coaches &amp; parents say
          </h2>
          <div className="mt-10 space-y-6">
            <blockquote className="rounded-xl border border-accent/20 bg-black/40 p-6">
              <p className="text-white/85 italic">
                &ldquo;I was already coaching privately. The Guild made scheduling and getting paid
                effortless.&rdquo;
              </p>
              <footer className="mt-3 text-sm text-white/50">— Guild coach</footer>
            </blockquote>
            {reviews.slice(0, 2).map((review) => (
              <blockquote
                key={review.id}
                className="rounded-xl border border-accent/20 bg-black/40 p-6"
              >
                <div className="mb-2 flex items-center gap-1 text-accent">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < review.rating ? 'fill-accent' : 'fill-none opacity-30'}`}
                      aria-hidden
                    />
                  ))}
                </div>
                <p className="text-white/85 italic">
                  &ldquo;{review.comment.length > 220 ? `${review.comment.slice(0, 220).trim()}…` : review.comment}&rdquo;
                </p>
                <footer className="mt-3 text-sm text-white/50">
                  — Parent · session with {review.coachFirstName} {review.coachLastName}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-accent/20 px-6 py-14 md:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center font-serif text-2xl font-black uppercase tracking-wide text-accent md:text-3xl">
            FAQ
          </h2>
          <div className="mt-8 divide-y divide-white/10 rounded-xl border border-accent/20">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-accent transition-transform group-open:rotate-180" aria-hidden />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-serif text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
            Ready to coach?
          </h2>
          <p className="mt-3 text-white/65">Apply today — most reviews within 48 hours.</p>
          <Button size="lg" variant="premium" asChild className="mt-8 min-h-[52px] px-10 text-base">
            <Link href="/signup/coach">Apply to Coach</Link>
          </Button>
          <p className="mt-6 text-xs text-white/45">
            Questions?{' '}
            <a href="mailto:info@WrestlingGuild.com" className="text-accent hover:underline">
              info@WrestlingGuild.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
