import { NextRequest, NextResponse } from 'next/server';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';

/** True for hashed Next assets and typical /public files — keep long-cache behavior from Next/Vercel. */
function isFingerprintedOrPublicFile(pathname: string): boolean {
  if (pathname.startsWith('/_next/') || pathname.startsWith('/_vercel/')) return true;
  // e.g. /icon.png, /sw.js — not app HTML
  if (/\.[a-zA-Z0-9]+$/.test(pathname) && !pathname.startsWith('/api')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const hostname = resolveHostnameFromHeaders(req.headers);

  // Extract tenant from subdomain / known domains
  const tenant = getTenantByDomain(hostname);

  // Unknown host: proceed without x-tenant-slug so Root Layout can render a single
  // "tenant not found" page. Never redirect to /404 — that path hits middleware again
  // and recreated the same redirect → ERR_TOO_MANY_REDIRECTS for some proxies / FB WebViews.
  if (!tenant) {
    const fallbackHeaders = new Headers(req.headers);
    fallbackHeaders.set('x-pathname', req.nextUrl.pathname);
    const res = NextResponse.next({
      request: { headers: fallbackHeaders },
    });
    if (!isFingerprintedOrPublicFile(req.nextUrl.pathname)) {
      res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
    }
    return res;
  }

  // Add tenant slug + pathname for Server Components (cell-phone gate, analytics, etc.).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-tenant-slug', tenant.slug);
  requestHeaders.set('x-pathname', req.nextUrl.pathname);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Stop edge/browser from serving stale HTML after a new Vercel deploy (old document + new chunk URLs = broken or old UI).
  if (!isFingerprintedOrPublicFile(req.nextUrl.pathname)) {
    res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};





