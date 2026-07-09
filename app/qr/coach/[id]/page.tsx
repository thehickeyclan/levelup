import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';
import { QrLinkActions } from '@/components/qr-link-actions';

export const dynamic = 'force-dynamic';

async function publicOriginFromRequest(): Promise<string> {
  const headersList = await headers();
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (explicit) return explicit;

  const host =
    headersList.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    headersList.get('host') ||
    '';
  const proto =
    headersList.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return { title: 'Coach sessions QR' };

  const admin = createAdminClient(tenant.slug);
  const { data: athlete } = await admin
    .from('athletes')
    .select('first_name, last_name')
    .eq('id', id)
    .maybeSingle();

  const name = athlete
    ? [athlete.first_name, athlete.last_name].filter(Boolean).join(' ').trim() || 'Coach'
    : 'Coach';

  return {
    title: `${name} — sessions QR | The Guild`,
    description: `Scan to see all upcoming sessions with ${name}.`,
  };
}

/** Per-coach QR — scan opens /coach/[id] with every scheduled session. */
export default async function CoachSessionsQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) notFound();

  const admin = createAdminClient(tenant.slug);
  const { data: athlete } = await admin
    .from('athletes')
    .select('id, first_name, last_name, active')
    .eq('id', id)
    .maybeSingle();

  if (!athlete?.active) notFound();

  const coachName =
    [athlete.first_name, athlete.last_name].filter(Boolean).join(' ').trim() || 'Coach';
  const origin = await publicOriginFromRequest();
  const targetUrl = coachPublicScheduleUrl(origin, id);

  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });

  const safeSlug = coachName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'coach';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-lg mx-auto px-4 py-10 pb-16">
        <h1 className="text-2xl font-bold font-serif text-center mb-1">{coachName}</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Scan to see all upcoming sessions and book. Use this QR on flyers, gym posters, and weekly
          graphics — one code for every session you schedule.
        </p>

        <div className="flex justify-center rounded-xl border border-border bg-card p-6 shadow-sm print:border-0 print:shadow-none print:p-4">
          {/* Data URL from qrcode — no next/image optimization needed */}
          <img
            src={qrDataUrl}
            alt={`QR code: scan to open ${coachName}'s upcoming sessions`}
            width={512}
            height={512}
            className="w-full max-w-[280px] sm:max-w-[320px] h-auto aspect-square"
          />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6 break-all font-mono px-1">
          {targetUrl}
        </p>

        <div className="mt-6">
          <QrLinkActions
            targetUrl={targetUrl}
            qrDataUrl={qrDataUrl}
            downloadFileName={`guild-${safeSlug}-sessions-qr.png`}
          />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-8 leading-relaxed">
          Instagram graphics stay per-session; this link and QR cover all sessions on your schedule.
        </p>
      </div>
    </div>
  );
}
