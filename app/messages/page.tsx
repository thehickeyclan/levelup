import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { IN_APP_MESSAGING_ENABLED } from '@/lib/in-app-messaging';
import { MessagesInboxClient } from '@/components/guild/messages-inbox-client';

export const metadata = { title: 'Messages' };

export default async function MessagesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  if (!IN_APP_MESSAGING_ENABLED) redirect('/dashboard');

  const sp = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/messages');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  const cookieStore = await cookies();
  const viewAsCoachId = role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
  const messagingAsCoach = role === 'coach' || (role === 'admin' && !!viewAsCoachId);
  const showNewMessage = role === 'parent' || role === 'coach' || role === 'admin';
  const inboxUserRole = messagingAsCoach ? 'coach' : role === 'admin' ? 'parent' : (role ?? 'parent');

  return (
    <MessagesInboxClient
      currentUserId={user.id}
      initialThreadId={sp.thread?.trim() || null}
      showNewMessage={showNewMessage}
      userRole={inboxUserRole}
      showCoachSessionHub={messagingAsCoach}
    />
  );
}
