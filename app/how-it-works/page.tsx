import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import { Check, Search, CalendarCheck, MapPin, CreditCard, Star } from 'lucide-react';

export const metadata = {
  title: 'How It Works | The Guild',
  description:
    'Browse verified wrestling coaches, book private or group sessions online, and train at real facilities across North Carolina.',
};

const PARENT_STEPS = [
  {
    step: '1',
    title: 'Browse verified coaches',
    body: 'Every coach is reviewed before approval. See school, credentials, reviews, and where they train.',
    icon: Search,
  },
  {
    step: '2',
    title: 'Book & pay online',
    body: 'Choose private, partner, or small-group sessions. Pick an open spot or request a time — checkout is secure.',
    icon: CreditCard,
  },
  {
    step: '3',
    title: 'Train & review',
    body: 'Show up at the facility listed on your booking. After the session, leave a review to help other families.',
    icon: Star,
  },
] as const;

const FORMATS = [
  {
    title: 'Private',
    body: 'One athlete with the coach — full attention on technique and reps.',
  },
  {
    title: 'Partner',
    body: 'Two athletes train together — great for teammates who want the same slot.',
  },
  {
    title: 'Small group',
    body: 'Join an open session coaches post on the calendar — often the fastest way to get on the mat.',
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
            Connect with elite college wrestlers and coaches in your community — browse, book, pay, and train in
            one place.
          </p>
        </div>
      </div>

      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3 md:gap-8">
          {PARENT_STEPS.map(({ step, title, body, icon: Icon }) => (
            <div
              key={step}
              className="rounded-xl border border-accent/25 bg-zinc-950/80 p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-serif text-lg font-black text-accent">
                  {step}
                </span>
                <Icon className="h-6 w-6 text-accent" aria-hidden />
              </div>
              <h2 className="font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-accent/20 bg-zinc-950/50 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
            Session formats
          </h2>
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

      <section className="border-t border-accent/20 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-xl text-center">
          <CalendarCheck className="mx-auto h-10 w-10 text-accent" aria-hidden />
          <h2 className="mt-4 font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
            Ready to book?
          </h2>
          <p className="mt-3 text-sm text-white/65">
            Create a free account, add your wrestler, and browse open sessions or coach calendars.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" variant="premium" asChild className="min-h-[48px]">
              <Link href="/training?tab=coaches">Browse Coaches</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="min-h-[48px] border-2 border-accent/60 text-accent hover:bg-accent/10"
            >
              <Link href="/signup">Sign Up Free</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-accent/20 bg-accent/10 px-6 py-10 md:py-12">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">NCAA wrestlers & coaches</p>
          <h2 className="mt-2 font-serif text-lg font-black uppercase tracking-wide text-white">
            Want to coach on The Guild?
          </h2>
          <p className="mt-2 text-sm text-white/70">
            Set your rates, open your calendar, and get paid when parents book.
          </p>
          <Button size="lg" variant="outline" asChild className="mt-6 min-h-[48px] border-2 border-accent/60 text-accent hover:bg-accent/10">
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
