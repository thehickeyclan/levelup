'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const linkClass =
  'block w-full text-left py-3 px-1 text-base font-medium text-foreground border-b border-border/60 last:border-0 hover:text-accent transition-colors';

type Props = {
  /** Logged-in users: compact menu (e.g. parent previewing marketing pages). */
  variant?: 'public' | 'logged-in';
};

/**
 * Mobile header menu for public / marketing pages — mirrors desktop Browse, For Coaches, etc.
 */
export function PublicHeaderMobile({ variant = 'public' }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-[44px] min-w-[44px] text-white hover:text-accent hover:bg-white/10"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{variant === 'public' ? 'Menu' : 'More'}</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col pt-2" aria-label="Site menu">
            <Link href="/training?tab=coaches" className={linkClass} onClick={close}>
              Browse Coaches
            </Link>
            <Link
              href="/coaches"
              className={`${linkClass} text-accent font-semibold`}
              onClick={close}
            >
              For Coaches — Apply
            </Link>
            <Link href="/how-it-works" className={linkClass} onClick={close}>
              How It Works
            </Link>
            {variant === 'public' ? (
              <>
                <Link href="/login" className={linkClass} onClick={close}>
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className={`${linkClass} text-accent font-semibold`}
                  onClick={close}
                >
                  Book Training — Sign up
                </Link>
              </>
            ) : (
              <Link href="/signup/coach" className={`${linkClass} text-accent font-semibold`} onClick={close}>
                Apply to Coach
              </Link>
            )}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
