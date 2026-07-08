import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function CoachApplySection() {
  return (
    <section className="border-t border-accent/20 bg-zinc-950 px-6 py-14 md:py-16">
      <div className="mx-auto max-w-lg space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          For NCAA wrestlers &amp; elite coaches
        </p>
        <h2 className="font-serif text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
          Coach on The Guild
        </h2>
        <p className="text-sm text-white/65 sm:text-base">
          Set your rates, open your calendar, and get paid when parents book — we handle scheduling
          and payments. Every coach is reviewed before approval.
        </p>
        <Button size="lg" variant="premium" asChild className="min-h-[48px] w-full max-w-xs">
          <Link href="/coaches">Apply Now</Link>
        </Button>
      </div>
    </section>
  );
}
