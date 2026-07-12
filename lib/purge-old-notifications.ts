import type { SupabaseClient } from '@supabase/supabase-js';
import { notificationRetentionCutoff } from '@/lib/notification-retention';

export async function purgeOldNotifications(admin: SupabaseClient): Promise<number> {
  const cutoff = notificationRetentionCutoff();
  const { data, error } = await admin
    .from('notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}
