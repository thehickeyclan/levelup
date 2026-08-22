'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Fixed coach signup CTA on mobile — /coaches has no bottom nav for logged-out visitors. */
export function CoachesStickyCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/30 bg-black/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden"
      role="navigation"
      aria-label="Create coach account"
    >
      <Button variant="premium" asChild className="h-14 w-full rounded-none text-base font-semibold">
        <Link href="/signup/coach">Create Coach Account</Link>
      </Button>
    </div>
  );
}
