/** Persisted for sell (optional) and collection (opt-out). Vault is legacy — treated as collection. */

export function isCollectionListingType(listingType: string): boolean {
  return listingType === 'collection' || listingType === 'vault';
}

export function normalizeListingTypeForWrite(listingType: string): string {
  return listingType === 'vault' ? 'collection' : listingType;
}

/** Collection showcase items accept unsolicited offers unless seller opted out. */
export function collectionAcceptsOffers(listing: {
  listing_type: string;
  accepts_offers?: boolean | null;
}): boolean {
  if (listing.listing_type === 'vault') return true;
  if (listing.listing_type !== 'collection') return false;
  return listing.accepts_offers !== false;
}

export function normalizeListingAcceptsOffers(
  listingType: string,
  priceCents: number | null | undefined,
  acceptsOffers: boolean | undefined | null
): boolean {
  const type = normalizeListingTypeForWrite(listingType);
  if (type === 'collection') {
    if (acceptsOffers === false) return false;
    return true;
  }
  if (type !== 'sell') return false;
  if (priceCents == null || priceCents <= 0) return false;
  return Boolean(acceptsOffers);
}

export function listingAllowsCashOffer(listing: {
  listing_type: string;
  price_cents: number | null;
  accepts_offers?: boolean | null;
}): boolean {
  const type = listing.listing_type;
  if (isCollectionListingType(type)) {
    return collectionAcceptsOffers(listing);
  }
  if (type === 'trade') return false;
  if (listing.price_cents == null) return true;
  return Boolean(listing.accepts_offers);
}

export function listingAllowsTradeOffer(listing: {
  listing_type: string;
  open_to_trade?: boolean;
}): boolean {
  if (listing.listing_type === 'trade') return true;
  if (listing.listing_type === 'sell' && listing.open_to_trade) return true;
  return false;
}
