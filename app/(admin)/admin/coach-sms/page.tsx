import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { AdminCoachSmsClient } from './coach-sms-client';

export const metadata = {
  title: 'Text coaches | Admin',
  description: 'Send SMS to college coaches via Twilio.',
};

export default async function AdminCoachSmsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/coach-sms');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/admin/users">Users</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href="/admin/message-log">SMS log</Link>
          </Button>
        </div>
      </div>

      <AdminCoachSmsClient />
    </div>
  );
}
