import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: coachId } = await params;
  const headersList = await headers();
  const host = resolveHostnameFromHeaders(headersList) || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const admin = createAdminClient(tenant.slug);
  const { data: coach } = await admin
    .from('athletes')
    .select('id, active')
    .eq('id', coachId)
    .maybeSingle();

  if (!coach?.active) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  const forwardedProto = headersList.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol =
    forwardedProto || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || `${protocol}://${host}`;
  const targetUrl = coachPublicScheduleUrl(origin, coachId);
  const png = await QRCode.toBuffer(targetUrl, {
    type: 'png',
    width: 720,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#050505', light: '#ffffff' },
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Disposition': `inline; filename="guild-coach-${coachId.slice(0, 8)}-qr.png"`,
    },
  });
}
