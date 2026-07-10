import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { ensureCoachInquiryThread } from '@/lib/guild-coach-inquiry';

/** Legacy DM URL → unified guild thread. */
export default async function InboxThreadRedirectPage({
  params,
}: {
  params: Promise<{ parentId: string; athleteId: string }>;
}) {
  const { parentId, athleteId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (user.id !== parentId && user.id !== athleteId) notFound();

  const admin = createAdminClient(tenant.slug);
  const threadId = await ensureCoachInquiryThread(admin, tenant.slug, parentId, athleteId);
  redirect(`/messages?thread=${threadId}`);
}
