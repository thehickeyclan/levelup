import Link from 'next/link';
import { ArrowRight, Trophy } from 'lucide-react';

export function TocGiveawayBanner() {
  return (
    <section className="border-y border-accent/20 bg-gradient-to-r from-accent/15 via-black to-accent/10 px-6 py-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10">
            <Trophy className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              Tournament of Champions Giveaway
            </p>
            <h2 className="mt-1 font-serif text-xl font-black uppercase tracking-wide text-white md:text-2xl">
              $1,000 back to NC wrestlers.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/65">
              10 wrestlers will each win $100 in Guild training credit. Create a free wrestler
              account by Sept. 15. No purchase necessary.
            </p>
          </div>
        </div>

        <Link
          href="/toc"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:bg-accent/90"
        >
          Enter free
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
