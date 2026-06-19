import {
  listingHeroImageUrl,
  type MarketListingImageRow,
  primaryListingImageUrl,
} from '@/lib/market/listing-images';
import { listingConditionDisplay, type MarketWearState } from '@/lib/market/wear-state';

export type TradeOfferListingReview = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  model_year: number | null;
  wear_state: MarketWearState;
  condition: string;
  condition_label: string;
  description: string | null;
  image_urls: string[];
  wrestle_score: number | null;
  cosmetic_score: number | null;
  condition_summary: string | null;
  cosmetic_summary: string | null;
};

type AiRow = {
  condition_score?: number | null;
  cosmetic_score?: number | null;
  condition_summary?: string | null;
  cosmetic_summary?: string | null;
} | null;

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  model_year?: number | null;
  condition: string;
  wear_state?: string | null;
  description?: string | null;
  market_listing_images?: MarketListingImageRow[] | null;
  market_ai_analysis?: AiRow | AiRow[] | null;
};

function resolveAi(row: ListingRow): AiRow {
  const ai = row.market_ai_analysis;
  if (!ai) return null;
  return Array.isArray(ai) ? ai[0] ?? null : ai;
}

export function mapTradeListingReview(row: ListingRow): TradeOfferListingReview {
  const images = [...(row.market_listing_images ?? [])].sort(
    (a, b) => a.display_order - b.display_order
  );
  const imageUrls = images.map((img, i) => listingHeroImageUrl(img, i === 0));
  const wearState = (row.wear_state as MarketWearState) || 'used';
  const ai = resolveAi(row);

  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    size: Number(row.size),
    model_year: row.model_year ?? null,
    wear_state: wearState,
    condition: row.condition,
    condition_label: listingConditionDisplay(wearState, row.condition),
    description: row.description?.trim() || null,
    image_urls: imageUrls.length ? imageUrls : primaryListingImageUrl(images) ? [primaryListingImageUrl(images)!] : [],
    wrestle_score: ai?.condition_score != null ? Number(ai.condition_score) : null,
    cosmetic_score: ai?.cosmetic_score != null ? Number(ai.cosmetic_score) : null,
    condition_summary: ai?.condition_summary?.trim() || null,
    cosmetic_summary: ai?.cosmetic_summary?.trim() || null,
  };
}

export const TRADE_LISTING_REVIEW_SELECT = `
  id, title, brand, model, size, model_year, condition, wear_state, description,
  market_listing_images(public_url, clean_public_url, use_clean, display_order),
  market_ai_analysis(condition_score, cosmetic_score, condition_summary, cosmetic_summary)
`;
