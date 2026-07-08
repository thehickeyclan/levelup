/** Public marketing pages — coach recruitment, requirements, company info. */
const MARKETING_ROUTES = [
  '/coaches',
  '/requirements',
  '/how-it-works',
  '/pricing',
  '/faqs',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

export function isMarketingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return MARKETING_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
