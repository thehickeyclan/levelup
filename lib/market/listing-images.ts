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

export function sortListingImages<T extends { display_order: number }>(images: T[]): T[] {
  return [...images].sort((a, b) => a.display_order - b.display_order);
}

/** Primary row — lowest display_order (first upload is 0). */
export function primaryListingImage<T extends { display_order: number }>(
  images: T[] | null | undefined
): T | null {
  if (!images?.length) return null;
  return sortListingImages(images)[0] ?? null;
}

export function isPrimaryListingImage(
  image: MarketListingImageRow & { id?: string },
  images: (MarketListingImageRow & { id?: string })[]
): boolean {
  const primary = primaryListingImage(images);
  if (!primary) return false;
  if (image.id && primary.id) return image.id === primary.id;
  return image.display_order === primary.display_order;
}

/** Reorder so the chosen image becomes cover (display_order 0). */
export function reorderListingImagesForPrimary<T extends { id: string; display_order: number }>(
  images: T[],
  primaryId: string
): T[] {
  const target = images.find((i) => i.id === primaryId);
  if (!target) return images;
  const others = sortListingImages(images.filter((i) => i.id !== primaryId));
  return [target, ...others].map((img, idx) => ({ ...img, display_order: idx }));
}

/** Primary listing photo — display_order 0 first; uses clean when selected. */
export function primaryListingImageUrl(
  images: MarketListingImageRow[] | null | undefined
): string | null {
  const primary = primaryListingImage(images);
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
  const primary = primaryListingImage(images);
  return Boolean(primary?.use_clean && primary?.clean_public_url);
}
