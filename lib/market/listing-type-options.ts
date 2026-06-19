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
    label: 'Collection',
    hint: 'Display only — not for sale',
  },
];

export function sellerListingTypeLabel(type: string): string {
  return SELLER_LISTING_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
