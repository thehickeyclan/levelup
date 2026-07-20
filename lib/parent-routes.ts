/** Routes where parent bottom nav + parent header links apply. */
const PARENT_ROUTES = [
  '/',
  '/dashboard',
  '/home',
  '/activity',
  '/training',
  '/find-training',
  '/browse',
  '/bookings',
  '/messages',
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
  '/more',
  '/coaches',
  '/requirements',
  '/how-it-works',
  '/pricing',
  '/faqs',
  '/about',
  '/contact',
];

export function isParentRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PARENT_ROUTES.some(
    (route) => pathname === route || (route !== '/dashboard' && pathname.startsWith(route + '/'))
  );
}
