/** Routes where parent bottom nav + parent header links apply. */
const PARENT_ROUTES = [
  '/',
  '/dashboard',
  '/home',
  '/training',
  '/find-training',
  '/browse',
  '/bookings',
  '/inbox',
  '/notifications',
  '/session-requests',
  '/account',
  '/my-wrestlers',
  '/my-coaches',
  '/partner-sessions',
  '/small-group-sessions',
  '/wrestlers',
  '/sessions',
  '/cart',
  '/wallet',
  '/checkout',
  '/market',
];

export function isParentRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PARENT_ROUTES.some(
    (route) => pathname === route || (route !== '/dashboard' && pathname.startsWith(route + '/'))
  );
}
