import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import {
  CalendarPlus,
  Check,
  Link2,
  MapPin,
  ShoppingCart,
  UserSearch,
  Users,
} from 'lucide-react';

export const metadata = {
  title: 'How It Works | The Guild',
  description:
    'Join open small-group sessions or book a specific coach for private or partner training. Pay online and train at real wrestling facilities.',
};

const OPEN_SESSION_STEPS = [
  'Create a free account and add your wrestler.',
  'Go to Training → Open sessions.',
  'Pick a small group or open partner spot — filter by date, coach, or location.',
  'Add to cart and checkout securely.',
  'Show up at the facility on your confirmation.',
] as const;

const BOOK_COACH_STEPS = [
  'Browse coaches — school, reviews, and where they train.',
  'Open a coach profile and check their calendar or request a time.',
  'Choose private (one athlete) or partner (two athletes).',
  'Private: coach confirms → you pay → you\'re booked.',
  'Partner: you book first, then share the invite link so the other family can join and pay.',
] as const;

const FORMATS = [
  {
    title: 'Small group',
    body: 'Coach posts open spots on the calendar — often the fastest way to get on the mat.',
  },
  {
    title: 'Private',
    body: 'One athlete with the coach. You request a time on their calendar.',
  },
  {
    title: 'Partner',
    body: 'Two athletes, one session. Book with a teammate in mind and send them the link — or grab the second spot on an open partner session.',
  },
] as const;

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="border-b border-accent/20 bg-zinc-950/80 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">For parents & athletes</p>
          <h1 className="mt-3 font-serif text-3xl font-black uppercase tracking-wide text-white md:text-4xl">
            How The Guild works
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-white/70 sm:text-base">
            Two ways to train — join a session that&apos;s already open, or book a specific coach for private or
            partner work.
          </p>
        </div>
      </div>

      {/* Two paths */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2 lg:gap-8">
          <article className="flex flex-col rounded-xl border border-accent/30 bg-zinc-950/80 p-6 md:p-8">
            <div className="mb-4 flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-accent" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-accent">Path 1 · Fastest</p>
                <h2 className="font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
                  Join an open session
                </h2>
              </div>
            </div>
            <p className="text-sm text-white/65">
              Best when you saw a posted camp slot, weekend group, or open partner spot — book in minutes.
            </p>
            <ol className="mt-6 flex-1 space-y-3">
              {OPEN_SESSION_STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-white/85">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Button size="lg" variant="premium" asChild className="mt-8 min-h-[48px] w-full">
              <Link href="/training?tab=sessions">See open sessions</Link>
            </Button>
          </article>

          <article className="flex flex-col rounded-xl border border-accent/25 bg-black/40 p-6 md:p-8">
            <div className="mb-4 flex items-center gap-3">
              <UserSearch className="h-8 w-8 text-accent" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Path 2</p>
                <h2 className="font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
                  Book a coach
                </h2>
              </div>
            </div>
            <p className="text-sm text-white/65">
              Best when you know who you want — private lessons or partner training with a teammate you choose.
            </p>
            <ol className="mt-6 flex-1 space-y-3">
              {BOOK_COACH_STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-white/85">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/40 text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-xs text-white/70">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>
                <strong className="text-white">Partner tip:</strong> after you book, Guild gives you a link to
                text to your partner&apos;s parent — they tap it, pay, and the session locks in.
              </span>
            </p>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="mt-6 min-h-[48px] w-full border-2 border-accent/60 text-accent hover:bg-accent/10"
            >
              <Link href="/training?tab=coaches">Browse coaches</Link>
            </Button>
          </article>
        </div>
      </section>

      {/* Formats reference */}
      <section className="border-t border-accent/20 bg-zinc-950/50 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
            Session formats
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-white/55">
            Same coaches, same facilities — different ways to get on the mat.
          </p>
          <div className="mt-8 space-y-4">
            {FORMATS.map(({ title, body }) => (
              <div
                key={title}
                className="flex gap-3 rounded-xl border border-accent/20 bg-black/40 px-5 py-4"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                <div>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-white/65">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-white/55">
            <MapPin className="h-4 w-4 text-accent" aria-hidden />
            Sessions run at real wrestling facilities — UNC, NC State, App State, and clubs near you.
          </p>
        </div>
      </section>

      {/* Get started */}
      <section className="border-t border-accent/20 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-xl text-center">
          <CalendarPlus className="mx-auto h-10 w-10 text-accent" aria-hidden />
          <h2 className="mt-4 font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
            New here?
          </h2>
          <p className="mt-3 text-sm text-white/65">
            Sign up free, add your wrestler, then pick open sessions or a coach — checkout is always on Guild.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" variant="premium" asChild className="min-h-[48px]">
              <Link href="/signup">Sign up free</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-[48px] border-2 border-accent/60 text-accent hover:bg-accent/10"
            >
              <Link href="/training?tab=sessions">See open sessions</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Coaches */}
      <section className="border-t border-accent/20 bg-accent/10 px-6 py-10 md:py-12">
        <div className="mx-auto max-w-xl text-center">
          <Users className="mx-auto h-8 w-8 text-accent" aria-hidden />
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">NCAA wrestlers & coaches</p>
          <h2 className="mt-2 font-serif text-lg font-black uppercase tracking-wide text-white">
            Want to coach on The Guild?
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Set your rates, post open sessions, and get paid when parents book.
          </p>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="mt-6 min-h-[48px] border-2 border-accent/60 text-accent hover:bg-accent/10"
          >
            <Link href="/coaches">Apply to Coach</Link>
          </Button>
        </div>
      </section>

      <div className="px-6 pb-16 pt-4 text-center">
        <BackLink
          fallbackHref="/"
          label="Back to home"
          className="text-sm text-white/50 hover:text-accent hover:underline"
        />
      </div>
    </main>
  );
}
