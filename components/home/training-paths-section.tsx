import Link from 'next/link';
import { Button } from '@/components/ui/button';

const cardBase =
  'flex flex-col rounded-xl border border-accent/35 bg-zinc-950/80 p-6 text-left';

export function TrainingPathsSection() {
  return (
    <section className="border-t border-accent/20 bg-black px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          How do you want to train?
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:gap-6">
          <div className={cardBase}>
            <h3 className="font-serif text-lg font-bold uppercase tracking-wide text-accent">
              Book a Coach
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Private or partner — you pick the coach, request a time, they confirm.
            </p>
            <Button
              variant="premium"
              asChild
              className="mt-5 min-h-[44px] w-full sm:w-auto"
            >
              <Link href="/training?tab=coaches">Browse Coaches</Link>
            </Button>
          </div>

          <div className={cardBase}>
            <h3 className="font-serif text-lg font-bold uppercase tracking-wide text-accent">
              Join an Open Session
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Small groups and partner spots already posted. Spots fill fast — see what&apos;s open now.
            </p>
            <Button
              variant="outline"
              asChild
              className="mt-5 min-h-[44px] w-full border-2 border-accent/60 text-accent hover:bg-accent/10 sm:w-auto"
            >
              <Link href="#open-sessions">See Open Sessions</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}