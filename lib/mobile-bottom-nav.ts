'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { isParentRoute } from '@/lib/parent-routes';

const COACH_ROUTES = [
  '/athlete-dashboard',
  '/coach-dashboard',
  '/availability',
  '/coach-help',
  '/coach-sessions',
  '/coach-roster',
  '/coach-earnings',
  '/coach-reviews',
  '/profile',
  '/rate-card',
  '/small-group-sessions',
  '/notifications',
  '/inbox',
  '/messages',
  '/workspaces',
  '/market',
];

const YOUTH_WRESTLER_ROUTES = [
  '/youth-dashboard',
  '/training',
  '/find-training',
  '/workspaces',
  '/small-group-sessions',
  '/browse',
  '/notifications',
  '/market',
];

function isCoachRoute(pathname: string): boolean {
  return COACH_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== '/athlete-dashboard' && pathname.startsWith(`${route}/`))
  );
}

function isYouthWrestlerRoute(pathname: string): boolean {
  return YOUTH_WRESTLER_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== '/youth-dashboard' && pathname.startsWith(`${route}/`))
  );
}

function isAdminRoute(pathname: string): boolean {
  if (pathname === '/account' || pathname.startsWith('/account/')) return true;
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** True when layout shows a fixed mobile bottom nav (matches ParentBottomNavWrapper). */
export function useMobileBottomNavVisible(): boolean {
  const pathname = usePathname() ?? '';
  const { user, userRole, viewAsRole, effectiveRole } = useAuth();

  if (!user) return false;

  const adminViewingAsParent = userRole === 'admin' && viewAsRole === 'parent';
  const adminViewingAsCoach = userRole === 'admin' && viewAsRole === 'coach';
  const adminViewingAsYouth = userRole === 'admin' && viewAsRole === 'youth_wrestler';

  if (adminViewingAsParent || (effectiveRole === 'parent' && isParentRoute(pathname))) {
    return true;
  }
  if (
    adminViewingAsCoach ||
    (effectiveRole === 'coach' && isCoachRoute(pathname))
  ) {
    return true;
  }
  if (adminViewingAsYouth || (effectiveRole === 'youth_wrestler' && isYouthWrestlerRoute(pathname))) {
    return true;
  }
  if (effectiveRole === 'admin' && !viewAsRole && isAdminRoute(pathname)) {
    return true;
  }
  return false;
}
