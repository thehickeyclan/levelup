import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import {
  fetchRawCampInvoiceLines,
  rawCampInvoiceTotalUsd,
  summarizeRawCampInvoiceBySession,
} from '@/lib/school-invoices/raw-team-camp-july-2026';
import { RawJuly2026InvoiceView } from './invoice-view';

export const dynamic = 'force-dynamic';

export default async function RawJuly2026InvoicePage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const lines = await fetchRawCampInvoiceLines(admin);
  const sessionSummaries = summarizeRawCampInvoiceBySession(lines);
  const totalUsd = rawCampInvoiceTotalUsd(lines);

  const now = new Date();
  const invoiceDateLabel = formatEST(now, 'MMM d, yyyy');
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);
  const dueDateLabel = formatEST(dueDate, 'MMM d, yyyy');

  return (
    <RawJuly2026InvoiceView
      tenantLogo={tenant.logo}
      invoiceDateLabel={invoiceDateLabel}
      dueDateLabel={dueDateLabel}
      lines={lines}
      sessionSummaries={sessionSummaries}
      totalUsd={totalUsd}
    />
  );
}
