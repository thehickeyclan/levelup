'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';

export function StickyMobileBar() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShow(window.scrollY > window.innerHeight);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (loading || user || !show) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-accent/30 bg-black/95 backdrop-blur-sm md:hidden"
      role="navigation"
      aria-label="Quick actions"
    >
      <Button variant="premium" asChild className="h-14 rounded-none text-xs sm:text-sm">
        <Link href="/training?tab=coaches">Browse</Link>
      </Button>
      <Button
        variant="outline"
        asChild
        className="h-14 rounded-none border-0 border-x border-accent/30 text-accent hover:bg-accent/10 text-xs sm:text-sm"
      >
        <Link href="/coaches">For Coaches</Link>
      </Button>
      <Button
        variant="outline"
        asChild
        className="h-14 rounded-none border-0 text-accent hover:bg-accent/10 text-xs sm:text-sm"
      >
        <Link href="/signup">Sign Up</Link>
      </Button>
    </div>
  );
}
