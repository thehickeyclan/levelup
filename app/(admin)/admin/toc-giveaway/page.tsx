import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { TOC_MARKET_FOLLOW_GOAL } from '@/lib/toc-giveaway';
import { TocGiveawayClient, type TocGiveawayEntry } from './toc-giveaway-client';

export default async function AdminTocGiveawayPage() {
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
  const { data, error } = await admin
    .from('toc_giveaway_entries')
    .select(
      'id, campaign, user_id, email, first_name, last_name, phone, zip_code, eligible, winner, credit_granted, credit_id, created_at, selected_at, credited_at'
    )
    .order('created_at', { ascending: false });

  if (error) console.error('TOC giveaway entries fetch error:', error);

  const entries = (data ?? []) as TocGiveawayEntry[];
  const userIds = entries.map((entry) => entry.user_id);
  let followCounts = new Map<string, number>();

  if (userIds.length > 0) {
    const { data: follows, error: followsError } = await admin
      .from('market_listing_follows')
      .select('follower_id')
      .in('follower_id', userIds);

    if (followsError) {
      console.error('TOC giveaway market follow count error:', followsError);
    } else {
      followCounts = new Map<string, number>();
      for (const follow of follows ?? []) {
        const followerId = follow.follower_id as string;
        followCounts.set(followerId, (followCounts.get(followerId) ?? 0) + 1);
      }
    }
  }

  const enrichedEntries = entries.map((entry) => {
    const shoeFollowCount = followCounts.get(entry.user_id) ?? 0;
    return {
      ...entry,
      shoe_follow_count: shoeFollowCount,
      market_qualified: shoeFollowCount >= TOC_MARKET_FOLLOW_GOAL,
    };
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">Tournament of Champions Giveaway</h1>
        <p className="mt-1 text-muted-foreground">
          Track eligible wrestler signups, select the 10 winners, and grant $100 Guild training credits.
        </p>
      </div>
      <TocGiveawayClient initialEntries={enrichedEntries} />
    </div>
  );
}
