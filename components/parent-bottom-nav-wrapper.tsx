'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { ParentBottomNav } from './parent-bottom-nav';
import { CoachBottomNav } from './coach-bottom-nav';
import { YouthWrestlerBottomNav } from './youth-wrestler-bottom-nav';
import { AdminBottomNav } from './admin-bottom-nav';
import { isParentRoute } from '@/lib/parent-routes';

const COACH_ROUTES = [
  '/athlete-dashboard',
  '/coach-dashboard',
  '/activity',
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
  '/activity',
  '/account',
  '/browse',
  '/book',
  '/training',
  '/find-training',
  '/workspaces',
  '/small-group-sessions',
  '/sessions',
  '/notifications',
  '/messages',
  '/inbox',
  '/market',
  '/wrestlers',
];

function isCoachRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return COACH_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== '/athlete-dashboard' && pathname.startsWith(route + '/'))
  );
}

function isYouthWrestlerRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return YOUTH_WRESTLER_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== '/youth-dashboard' && pathname.startsWith(route + '/'))
  );
}

function isAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/account' || pathname.startsWith('/account/')) return true;
  if (pathname === '/activity' || pathname.startsWith('/activity/')) return true;
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** One menu system on mobile: bottom nav for everyone (parent, coach, youth_wrestler, admin). */
export function ParentBottomNavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { effectiveRole, userRole, viewAsRole } = useAuth();
  
  // When admin switches to parent view, show parent nav regardless of current route
  const adminViewingAsParent = userRole === 'admin' && viewAsRole === 'parent';
  const adminViewingAsCoach = userRole === 'admin' && viewAsRole === 'coach';
  const adminViewingAsYouth = userRole === 'admin' && viewAsRole === 'youth_wrestler';
  
  const showParentNav = adminViewingAsParent || (effectiveRole === 'parent' && isParentRoute(pathname));
  const showCoachNav =
    adminViewingAsCoach ||
    (effectiveRole === 'coach' && isCoachRoute(pathname));
  const showYouthNav = adminViewingAsYouth || (effectiveRole === 'youth_wrestler' && isYouthWrestlerRoute(pathname));
  const showAdminNav = effectiveRole === 'admin' && !viewAsRole && isAdminRoute(pathname);
  const showNav = showParentNav || showCoachNav || showYouthNav || showAdminNav;

  return (
    <>
      {showNav ? (
        <div className="pb-20 md:pb-0">
          {children}
        </div>
      ) : (
        children
      )}
      {showParentNav && <ParentBottomNav />}
      {showCoachNav && <CoachBottomNav />}
      {showYouthNav && <YouthWrestlerBottomNav />}
      {showAdminNav && (
        <Suspense fallback={null}>
          <AdminBottomNav />
        </Suspense>
      )}
    </>
  );
}
