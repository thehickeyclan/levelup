import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function CoachApplySection() {
  return (
    <section className="border-t border-accent/20 bg-zinc-950 px-6 py-14 md:py-16">
      <div className="mx-auto max-w-lg space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          Built for college wrestlers &amp; coaches
        </p>
        <h2 className="font-serif text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
          Run your coaching business
        </h2>
        <p className="text-sm text-white/65 sm:text-base">
          Publish availability, fill private and small-group sessions, message families, track
          athletes, and share one booking link. Create your account now; verification unlocks paid bookings.
        </p>
        <Button size="lg" variant="premium" asChild className="min-h-[48px] w-full max-w-xs">
          <Link href="/signup/coach">Create Coach Account</Link>
        </Button>
      </div>
    </section>
  );
}
