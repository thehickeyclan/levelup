import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import {
  dominantSellerBrand,
  dominantSellerListing,
  fetchSellerShoeHints,
} from '@/lib/market/seller-shoe-hints';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;

  const hints = await fetchSellerShoeHints(supabase, user!.id);
  const dominantListing = dominantSellerListing(hints);

  return NextResponse.json({
    hints,
    dominantBrand: dominantSellerBrand(hints),
    dominantListing,
  });
}
