/** Fields to select on market_listing_images for display URL resolution. */
export const MARKET_LISTING_IMAGE_FIELDS =
  'public_url, clean_public_url, use_clean, display_order';

export const MARKET_LISTING_IMAGE_FIELDS_WITH_ID =
  `id, ${MARKET_LISTING_IMAGE_FIELDS}`;

export type MarketListingImageRow = {
  id?: string;
  public_url: string;
  clean_public_url?: string | null;
  use_clean?: boolean;
  display_order: number;
};

/** Resolved display URL — clean version when enabled and available. */
export function listingImageDisplayUrl(image: MarketListingImageRow): string {
  if (image.use_clean && image.clean_public_url) {
    return image.clean_public_url;
  }
  return image.public_url;
}

/** Primary listing photo — display_order 0 first; uses clean when selected. */
export function primaryListingImageUrl(
  images: MarketListingImageRow[] | null | undefined
): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const primary = sorted[0];
  if (!primary) return null;
  return listingImageDisplayUrl(primary);
}

/** Hero on listing detail — clean only for primary slot (display_order 0). */
export function listingHeroImageUrl(
  image: MarketListingImageRow,
  isPrimarySlot: boolean
): string {
  if (isPrimarySlot && image.display_order === 0) {
    return listingImageDisplayUrl(image);
  }
  return image.public_url;
}

export function primaryImageUsesClean(
  images: MarketListingImageRow[] | null | undefined
): boolean {
  if (!images?.length) return false;
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);
  const primary = sorted[0];
  return Boolean(primary?.use_clean && primary?.clean_public_url);
}
