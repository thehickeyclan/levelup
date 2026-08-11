import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  TOC_GIVEAWAY_DEADLINE_LABEL,
  TOC_INSTAGRAM_URL,
  TOC_MARKET_FOLLOW_GOAL,
} from '@/lib/toc-giveaway';

const details = [
  '$1,000 committed to North Carolina wrestling',
  '10 wrestlers will each receive $100 in Guild training credit',
  `Create a free wrestler account by ${TOC_GIVEAWAY_DEADLINE_LABEL}`,
  `Favorite ${TOC_MARKET_FOLLOW_GOAL} shoes in Guild Market`,
];

const steps = [
  'Download the free iPhone app',
  'Create a free wrestler account',
  'Follow The Wrestling Guild on Instagram',
  `Favorite ${TOC_MARKET_FOLLOW_GOAL} shoes in Guild Market`,
  'No purchase necessary',
];

export default function TocGiveawayPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-accent">
            Tournament of Champions × The Wrestling Guild
          </p>
          <h1 className="mt-5 font-serif text-5xl font-bold leading-tight md:text-7xl">
            $100 training-credit giveaway for NC wrestlers.
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white/70">
            The Guild is giving $1,000 back to wrestlers at the Tournament of Champions:
            10 North Carolina wrestlers will each win $100 in training credit with Guild coaches.
            Create a free account, follow The Guild, and favorite shoes in the marketplace to join the launch raffle.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-accent text-black hover:bg-accent-hover">
              <Link href="/signup/role?campaign=toc_2026">Create free wrestler account</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-accent/60 bg-transparent text-accent hover:bg-accent/10 hover:text-accent"
            >
              <Link href="/training">See Guild training</Link>
            </Button>
          </div>
          <div className="mt-3">
            <Link
              href={TOC_INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-accent underline underline-offset-4"
            >
              Follow @WrestlingGuild on Instagram
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {details.map((detail) => (
            <Card key={detail} className="border-white/10 bg-white/[0.04]">
              <CardContent className="p-5">
                <p className="text-sm font-medium leading-relaxed text-white/80">{detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-serif text-2xl font-semibold">How to enter the Market launch raffle</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {steps.map((step, index) => (
              <div key={step} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
                  Step {index + 1}
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/80">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 max-w-3xl rounded-2xl border border-accent/30 bg-accent/10 p-5">
          <h2 className="font-serif text-2xl font-semibold text-accent">Why The Guild?</h2>
          <p className="mt-3 text-white/70">
            We connect wrestlers with current and former NCAA athletes, club coaches, and local
            training opportunities — private sessions, partner sessions, small groups, and a growing
            wrestling marketplace for shoes and gear.
          </p>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-white/45">
          Eligibility begins today and runs through {TOC_GIVEAWAY_DEADLINE_LABEL}. Winners will be
          announced at the Tournament of Champions. No purchase necessary. Free wrestler account
          creation is required so credits can be issued to the winner&apos;s Guild wallet.
        </p>
      </section>
    </main>
  );
}
