import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';
import { normalizePhone, sendSms } from '@/lib/twilio';
import { parseNotificationPreferences } from '@/lib/notification-preferences';
import { formatSellerDisplayName } from '@/lib/market/seller';

const SMS_CAP = 50;

type DropListing = {
  id: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  listing_type: string;
};

function listingTitle(listing: DropListing): string {
  return (
    listing.title?.trim() ||
    [listing.brand, listing.model].filter(Boolean).join(' ') ||
    'A pair'
  );
}

function dropStatusLabel(listingType: string): string {
  return listingType === 'vault' ? 'accepting offers' : 'for sale';
}

/**
 * Notify followers when a collection listing moves to vault or sell.
 * In-app for all followers; SMS up to 50 with phone and SMS not opted out.
 */
export async function notifySellerDropFollowers(
  tenantSlug: string,
  sellerId: string,
  listing: DropListing
): Promise<{ inAppSent: number; smsSent: number }> {
  const result = { inAppSent: 0, smsSent: 0 };
  try {
    const admin = createAdminClient(tenantSlug);

    const { data: follows } = await admin
      .from('market_seller_follows')
      .select('follower_id')
      .eq('seller_id', sellerId);

    if (!follows?.length) return result;

    const { data: sellerUser } = await admin
      .from('users')
      .select('first_name, last_name')
      .eq('id', sellerId)
      .maybeSingle();

    const sellerName = formatSellerDisplayName(
      sellerUser?.first_name as string | null,
      sellerUser?.last_name as string | null
    );
    const title = listingTitle(listing);
    const statusLabel = dropStatusLabel(listing.listing_type);
    const link = `/market/listing/${listing.id}`;

    const followerIds = follows.map((f) => f.follower_id as string);
    const { data: users } = await admin
      .from('users')
      .select('id, phone, notification_preferences')
      .in('id', followerIds);

    const userById = new Map((users ?? []).map((u) => [u.id as string, u]));

    let smsCount = 0;
    for (const follow of follows) {
      const followerId = follow.follower_id as string;
      await createNotification(admin, {
        user_id: followerId,
        type: 'market_seller_drop',
        title: `${sellerName} just listed something`,
        body: `${title} is now ${statusLabel}`,
        data: { listing_id: listing.id, listingId: listing.id, link },
      });
      result.inAppSent += 1;

      if (smsCount >= SMS_CAP) continue;
      const user = userById.get(followerId);
      if (!user) continue;
      const prefs = parseNotificationPreferences(user.notification_preferences);
      if (prefs.sms_opted_out) continue;
      const phone = normalizePhone(user.phone as string | null | undefined);
      if (!phone) continue;

      void sendSms(
        phone,
        `${sellerName} listed ${title} on Guild Market — now ${statusLabel}. Open the app to view.`,
        {
          admin,
          messageType: 'market_seller_drop',
          recipientId: followerId,
        }
      );
      smsCount += 1;
      result.smsSent += 1;
    }
  } catch (e) {
    console.error('notifySellerDropFollowers:', e);
  }
  return result;
}
