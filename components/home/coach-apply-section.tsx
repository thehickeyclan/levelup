import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function CoachApplySection() {
  return (
    <section className="border-t border-accent/20 bg-black px-6 py-10">
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <p className="text-sm text-white/70">
          Division I wrestler or elite coach?
        </p>
        <p className="text-sm text-white/60">
          Join The Guild — coach local athletes, set your own schedule, keep 80% of every session.
        </p>
        <Button
          size="lg"
          variant="outline"
          asChild
          className="w-full max-w-[280px] border-accent/60 text-accent hover:bg-accent/10"
        >
          <Link href="/signup/coach">Apply to Join The Guild</Link>
        </Button>
      </div>
    </section>
  );
}
