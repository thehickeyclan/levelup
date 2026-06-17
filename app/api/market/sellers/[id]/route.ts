import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { getSellerProfile } from '@/lib/market/seller';
import {
  fetchMarketSellerReviews,
  fetchMarketSellerSoldHistory,
  fetchMarketSellerStats,
} from '@/lib/market/seller-reputation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase } = ctx;
  const { id: sellerId } = await params;

  const seller = await getSellerProfile(supabase, sellerId);
  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  const [stats, soldHistory, reviews] = await Promise.all([
    fetchMarketSellerStats(supabase, sellerId),
    fetchMarketSellerSoldHistory(supabase, sellerId),
    fetchMarketSellerReviews(supabase, sellerId),
  ]);

  return NextResponse.json({ seller, stats, soldHistory, reviews });
}
