/** Seller-facing labels — DB values: sell | trade | vault | collection. */

export type MarketListingType = 'sell' | 'trade' | 'vault' | 'collection';

export const SELLER_LISTING_TYPE_OPTIONS: {
  value: MarketListingType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'sell',
    label: 'For Sale',
    hint: 'Set a price — buyers check out instantly',
  },
  {
    value: 'trade',
    label: 'Trade',
    hint: 'Swap for another pair — no cash',
  },
  {
    value: 'vault',
    label: 'Offers',
    hint: 'No set price — see what people offer',
  },
  {
    value: 'collection',
    label: 'Showcase',
    hint: 'In your closet — not listed for sale',
  },
];

export function sellerListingTypeLabel(type: string): string {
  return SELLER_LISTING_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/** Seller-facing status pill for an active listing row. */
export function sellerListingStatusBadge(
  listingType: string,
  status: string
): { label: string; className: string } {
  if (status === 'draft') {
    return { label: 'Draft', className: 'text-amber-400 border-amber-500/40' };
  }
  if (status === 'sold') {
    return { label: 'Sold', className: 'text-muted-foreground border-border' };
  }
  if (status === 'traded') {
    return { label: 'Traded', className: 'text-muted-foreground border-border' };
  }
  if (status === 'active') {
    switch (listingType) {
      case 'collection':
        return { label: 'Showcase', className: 'text-muted-foreground border-border' };
      case 'sell':
        return { label: 'For sale', className: 'text-emerald-400 border-emerald-500/40' };
      case 'vault':
        return { label: 'Offers', className: 'text-accent border-accent/40' };
      case 'trade':
        return { label: 'Trade', className: 'text-sky-400 border-sky-500/40' };
    }
  }
  return { label: status, className: 'text-muted-foreground border-border' };
}
