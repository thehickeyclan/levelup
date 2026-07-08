'use client';

import { useAuth } from '@/lib/auth/use-auth';
import { useMobileBottomNavVisible } from '@/lib/mobile-bottom-nav';
import { CoachesStickyCta } from '@/components/coaches/coaches-sticky-cta';

/** Sticky Apply bar when mobile has no bottom nav (logged-out / coach visitors). */
export function CoachesStickyCtaWrapper() {
  const { loading } = useAuth();
  const bottomNavVisible = useMobileBottomNavVisible();

  if (loading || bottomNavVisible) return null;

  return <CoachesStickyCta />;
}
