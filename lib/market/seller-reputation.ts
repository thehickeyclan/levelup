import type { SupabaseClient } from '@supabase/supabase-js';

export type MarketSellerStats = {
  salesCount: number;
  reviewCount: number;
  averageRating: number | null;
  positivePercent: number | null;
  memberSince: string | null;
};

export type MarketSoldHistoryItem = {
  listingId: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  amountCents: number | null;
  soldAt: string;
  imageUrl: string | null;
  source: 'order' | 'listing';
};

export type MarketSellerReview = {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  buyerLabel: string;
};

function parseStatsRow(raw: Record<string, unknown> | null): MarketSellerStats {
  if (!raw) {
    return {
      salesCount: 0,
      reviewCount: 0,
      averageRating: null,
      positivePercent: null,
      memberSince: null,
    };
  }
  const avg = raw.average_rating;
  return {
    salesCount: Number(raw.sales_count ?? 0),
    reviewCount: Number(raw.review_count ?? 0),
    averageRating: avg != null ? Number(avg) : null,
    positivePercent: raw.positive_percent != null ? Number(raw.positive_percent) : null,
    memberSince: (raw.member_since as string) ?? null,
  };
}

export async function fetchMarketSellerStats(
  supabase: SupabaseClient,
  sellerId: string
): Promise<MarketSellerStats> {
  const { data, error } = await supabase.rpc('get_market_seller_public_stats', {
    p_seller_id: sellerId,
  });
  if (error) {
    console.error('get_market_seller_public_stats:', error);
    return parseStatsRow(null);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return parseStatsRow(row as Record<string, unknown> | null);
}

export async function fetchMarketSellerSoldHistory(
  supabase: SupabaseClient,
  sellerId: string,
  limit = 24
): Promise<MarketSoldHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_market_seller_sold_history', {
    p_seller_id: sellerId,
    p_limit: limit,
  });
  if (error) {
    console.error('get_market_seller_sold_history:', error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    listingId: row.listing_id as string,
    title: row.title as string,
    brand: row.brand as string,
    model: row.model as string,
    size: Number(row.size),
    amountCents: row.amount_cents != null ? Number(row.amount_cents) : null,
    soldAt: row.sold_at as string,
    imageUrl: (row.image_url as string) ?? null,
    source: row.source as 'order' | 'listing',
  }));
}

export async function fetchMarketSellerReviews(
  supabase: SupabaseClient,
  sellerId: string,
  limit = 20
): Promise<MarketSellerReview[]> {
  const { data, error } = await supabase.rpc('get_market_seller_public_reviews', {
    p_seller_id: sellerId,
    p_limit: limit,
  });
  if (error) {
    console.error('get_market_seller_public_reviews:', error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    rating: Number(row.rating),
    comment: (row.comment as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    createdAt: row.created_at as string,
    buyerLabel: (row.buyer_label as string) || 'Buyer',
  }));
}

export function formatSalesCount(count: number): string {
  if (count === 0) return 'No sales yet';
  if (count === 1) return '1 sale';
  return `${count} sales`;
}

export function formatPositiveFeedback(percent: number | null, reviewCount: number): string | null {
  if (reviewCount === 0) return null;
  if (percent == null) return null;
  return `${percent}% positive`;
}

export function sellerTrustLabel(stats: MarketSellerStats): string {
  const parts: string[] = [];
  parts.push(formatSalesCount(stats.salesCount));
  const positive = formatPositiveFeedback(stats.positivePercent, stats.reviewCount);
  if (positive) parts.push(positive);
  else if (stats.reviewCount === 0 && stats.salesCount > 0) parts.push('No feedback yet');
  return parts.join(' · ');
}
