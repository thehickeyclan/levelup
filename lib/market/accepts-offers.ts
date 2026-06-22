/** Persisted only for sell + list price; otherwise always false. */
export function normalizeListingAcceptsOffers(
  listingType: string,
  priceCents: number | null | undefined,
  acceptsOffers: boolean | undefined | null
): boolean {
  if (listingType !== 'sell') return false;
  if (priceCents == null || priceCents <= 0) return false;
  return Boolean(acceptsOffers);
}

export function listingAllowsCashOffer(listing: {
  listing_type: string;
  price_cents: number | null;
  accepts_offers?: boolean;
}): boolean {
  const type = listing.listing_type;
  if (type === 'collection') return false;
  if (type === 'vault') return true;
  if (type === 'trade') return false;
  if (listing.price_cents == null) return true;
  return Boolean(listing.accepts_offers);
}

export function listingAllowsTradeOffer(listing: {
  listing_type: string;
  open_to_trade?: boolean;
}): boolean {
  if (listing.listing_type === 'trade') return true;
  if (listing.listing_type === 'vault') return true;
  if (listing.listing_type === 'sell' && listing.open_to_trade) return true;
  return false;
}
