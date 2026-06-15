import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import {
  filterNotificationsForAudience,
  readNotificationAudienceFromCookies,
  resolveNotificationUserId,
  type NotificationRow,
} from '@/lib/notification-audience';
import { Card, CardContent } from '@/components/ui/card';
import { BackLink } from '@/components/back-link';
import { Bell } from 'lucide-react';
import { NotificationsClient } from './notifications-client';
import { NotificationPreferencesForm } from '@/components/notification-preferences-form';
import { parseNotificationPreferences } from '@/lib/notification-preferences';

export default async function NotificationsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/notifications');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const cookieStore = await cookies();
  const audience = readNotificationAudienceFromCookies(cookieStore, userData?.role ?? null, user.id);
  const targetUserId = resolveNotificationUserId(audience);
  const isCoachView =
    userData?.role === 'coach' || (userData?.role === 'admin' && audience.viewAsRole === 'coach');
  const isParentView = userData?.role === 'parent' || (userData?.role === 'admin' && audience.viewAsRole !== 'coach');

  let notificationPrefs = null;
  let userPhone: string | null = null;
  if (isParentView) {
    const { data: prefRow } = await supabase
      .from('users')
      .select('notification_preferences, phone')
      .eq('id', user.id)
      .single();
    notificationPrefs = parseNotificationPreferences(prefRow?.notification_preferences);
    userPhone = prefRow?.phone ?? null;
  }

  const queryDb = targetUserId !== user.id ? createAdminClient(tenant.slug) : supabase;
  const { data: notifications } = await queryDb
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .limit(50);

  const filtered = filterNotificationsForAudience((notifications ?? []) as NotificationRow[], audience);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-4">
        <BackLink
          fallbackHref={isCoachView ? '/athlete-dashboard' : '/dashboard'}
          label="Back to Dashboard"
        />
      </div>
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Bell className="h-6 w-6" />
        Notifications
      </h1>
      {isParentView && notificationPrefs && (
        <div className="mb-8">
          <NotificationPreferencesForm
            initialPreferences={notificationPrefs}
            initialPhone={userPhone}
          />
        </div>
      )}
      <NotificationsClient
        initialNotifications={filtered as Array<{
          id: string;
          type: string;
          title: string;
          body?: string;
          data?: Record<string, unknown>;
          read_at: string | null;
          created_at: string;
        }>}
      />
    </div>
  );
}
