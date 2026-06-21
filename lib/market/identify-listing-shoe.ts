import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import type { ListingEnrichment } from '@/lib/market/catalog-listing-enrich';

export type IdentifyListingShoeResponse = {
  result: ShoeIdResult;
  resultId: string | null;
  catalogMatchId: string | null;
  catalogEnrichment: ListingEnrichment | null;
  remaining?: number;
  autoApplyRecommended?: boolean;
};

export async function identifyListingShoe(input: {
  listingId?: string;
  images?: string[];
  brandHint?: string;
  modelHint?: string;
}): Promise<IdentifyListingShoeResponse> {
  const res = await fetch('/api/market/shoe-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: input.listingId,
      images: input.images,
      brandHint: input.brandHint?.trim() || undefined,
      modelHint: input.modelHint?.trim() || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Shoe identification failed');
  }
  return data as IdentifyListingShoeResponse;
}
