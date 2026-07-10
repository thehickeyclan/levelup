import type { NextRequest } from 'next/server';

function baseUrlFromHostHeaders(headers: Headers): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, '');
  const proto = headers.get('x-forwarded-proto') || 'https';
  const host = headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

/** Prefer NEXT_PUBLIC_APP_URL in production; fall back to request host. */
export function getRequestBaseUrl(req: NextRequest): string {
  return baseUrlFromHostHeaders(req.headers);
}

export function getRequestBaseUrlFromHeaders(headers: Headers): string {
  return baseUrlFromHostHeaders(headers);
}
