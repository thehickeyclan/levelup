export type MarketListingImageRow = { public_url: string; display_order: number };

/** Primary listing photo — display_order 0 first, then lowest order. */
export function primaryListingImageUrl(
  images: MarketListingImageRow[] | null | undefined
): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  return sorted[0]?.public_url ?? null;
}
