import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getTenantByDomain } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TOC_GIVEAWAY_CAMPAIGN, TOC_MARKET_FOLLOW_GOAL } from '@/lib/toc-giveaway';

export async function GET() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      campaign: TOC_GIVEAWAY_CAMPAIGN,
      followCount: 0,
      followGoal: TOC_MARKET_FOLLOW_GOAL,
      qualified: false,
      entry: null,
    });
  }

  const admin = createAdminClient(tenant.slug);
  const [followResult, entryResult] = await Promise.all([
    admin
      .from('market_listing_follows')
      .select('listing_id', { count: 'exact', head: true })
      .eq('follower_id', user.id),
    admin
      .from('toc_giveaway_entries')
      .select('id, eligible, winner, credit_granted, created_at')
      .eq('campaign', TOC_GIVEAWAY_CAMPAIGN)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (followResult.error) {
    console.error('TOC market progress follow count error:', followResult.error);
  }
  if (entryResult.error) {
    console.error('TOC market progress entry error:', entryResult.error);
  }

  const followCount = followResult.count ?? 0;

  return NextResponse.json({
    authenticated: true,
    campaign: TOC_GIVEAWAY_CAMPAIGN,
    followCount,
    followGoal: TOC_MARKET_FOLLOW_GOAL,
    qualified: followCount >= TOC_MARKET_FOLLOW_GOAL,
    entry: entryResult.data ?? null,
  });
}
