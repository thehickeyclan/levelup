import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { getSellerProfile } from '@/lib/market/seller';
import {
  fetchMarketSellerReviews,
  fetchMarketSellerSoldHistory,
  fetchMarketSellerStats,
} from '@/lib/market/seller-reputation';
import { fetchSellerActiveInventory } from '@/lib/market/seller-inventory';
import { fetchCollectionValuation } from '@/lib/market/collection-valuation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: sellerId } = await params;

  const seller = await getSellerProfile(tenant.slug, sellerId);

  const isOwnProfile = user!.id === sellerId;

  const [stats, soldHistory, reviews, inventory, followerCountRes, followingRes, collectionValuation] =
    await Promise.all([
      fetchMarketSellerStats(supabase, sellerId),
      fetchMarketSellerSoldHistory(supabase, sellerId),
      fetchMarketSellerReviews(supabase, sellerId),
      fetchSellerActiveInventory(supabase, sellerId),
      supabase
        .from('market_seller_follows')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId),
      isOwnProfile
        ? Promise.resolve({ data: null })
        : supabase
            .from('market_seller_follows')
            .select('id')
            .eq('follower_id', user!.id)
            .eq('seller_id', sellerId)
            .maybeSingle(),
      isOwnProfile ? fetchCollectionValuation(supabase, sellerId) : Promise.resolve(null),
    ]);

  return NextResponse.json({
    seller,
    stats,
    soldHistory,
    reviews,
    inventory,
    followerCount: followerCountRes.count ?? 0,
    following: isOwnProfile ? false : Boolean(followingRes.data),
    viewer: { isOwnProfile },
    collectionValuation,
  });
}
