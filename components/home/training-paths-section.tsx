import Link from 'next/link';
import { Button } from '@/components/ui/button';

const cardBase =
  'flex flex-col rounded-xl border border-accent/35 bg-zinc-950/80 p-6 text-left';

export function TrainingPathsSection() {
  return (
    <section className="border-t border-accent/20 bg-black px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          Two ways to train
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-white/55">
          Join a session that&apos;s already open, or book a specific coach.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:gap-6">
          <div className={cardBase}>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Path 1 · Fastest</p>
            <h3 className="mt-1 font-serif text-lg font-bold uppercase tracking-wide text-white">
              Join an open session
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Small groups and partner spots coaches already posted. Add to cart, pay, and show up — often the
              quickest way on the mat.
            </p>
            <Button
              variant="premium"
              asChild
              className="mt-5 min-h-[44px] w-full sm:w-auto"
            >
              <Link href="/training?tab=sessions">See open sessions</Link>
            </Button>
          </div>

          <div className={cardBase}>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/45">Path 2</p>
            <h3 className="mt-1 font-serif text-lg font-bold uppercase tracking-wide text-white">
              Book a coach
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Pick the coach you want. Request a private or partner session on their calendar — for partner,
              share the invite link with your teammate&apos;s family after you book.
            </p>
            <Button
              variant="outline"
              asChild
              className="mt-5 min-h-[44px] w-full border-2 border-accent/60 text-accent hover:bg-accent/10 sm:w-auto"
            >
              <Link href="/training?tab=coaches">Browse coaches</Link>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-white/45">
          <Link href="/how-it-works" className="text-accent hover:underline">
            How it works →
          </Link>
        </p>
      </div>
    </section>
  );
}
