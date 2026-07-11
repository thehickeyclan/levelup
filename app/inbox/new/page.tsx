import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { NewMessageClient } from './new-message-client';

export default async function InboxNewPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/inbox/new');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  if (role !== 'parent' && role !== 'coach' && role !== 'admin') redirect('/inbox');

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-bold">New message</h1>
        <p className="text-sm text-muted-foreground">
          {role === 'coach'
            ? 'Search sessions to message everyone, or start a direct message with a parent.'
            : 'Start a direct message with any coach.'}
        </p>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <NewMessageClient currentUserId={user.id} role={role ?? 'parent'} />
      </div>
    </div>
  );
}
