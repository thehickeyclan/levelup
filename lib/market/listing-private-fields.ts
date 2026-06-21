/** Seller-only listing fields — strip from API responses for buyers and public views. */
export const SELLER_PRIVATE_LISTING_FIELDS = [
  'purchase_source',
  'purchase_price_cents',
  'purchased_at',
] as const;

export type SellerPrivateListingField = (typeof SELLER_PRIVATE_LISTING_FIELDS)[number];

export function stripSellerPrivateListingFields<T extends Record<string, unknown>>(listing: T): T {
  const out = { ...listing };
  for (const key of SELLER_PRIVATE_LISTING_FIELDS) {
    delete out[key];
  }
  return out;
}
