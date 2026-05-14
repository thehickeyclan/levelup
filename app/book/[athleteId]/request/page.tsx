import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';

function normalizeBookTimeParam(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Legacy URL: custom session requests are disabled — send parents to normal booking from coach availability. */
export default async function RequestSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ youthWrestlerId?: string; sessionType?: string; date?: string; time?: string }>;
}) {
  const { athleteId } = await params;
  const sp = await searchParams;
  const preselectedYouthWrestlerId = sp.youthWrestlerId ?? null;
  const dateQ = sp.date?.trim();
  const timeNorm = sp.time?.trim() ? normalizeBookTimeParam(sp.time) : null;

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) notFound();

  const supabase = await createClient(tenant.slug);

  const qs = new URLSearchParams();
  if (preselectedYouthWrestlerId) qs.set('youthWrestlerId', preselectedYouthWrestlerId);
  if (dateQ && /^\d{4}-\d{2}-\d{2}$/.test(dateQ) && timeNorm) {
    qs.set('date', dateQ);
    qs.set('time', timeNorm);
  }
  const bookPath = qs.toString() ? `/book/${athleteId}?${qs.toString()}` : `/book/${athleteId}`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent(bookPath));
  }

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role === 'coach') redirect('/athlete-dashboard');
  if (
    userData?.role !== 'parent' &&
    userData?.role !== 'admin' &&
    userData?.role !== 'youth_wrestler'
  ) {
    redirect('/browse');
  }

  redirect(bookPath);
}
