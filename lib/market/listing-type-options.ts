/** Seller-facing labels — DB values: sell | trade | vault | collection. */

export type MarketListingType = 'sell' | 'trade' | 'vault' | 'collection';

export const SELLER_LISTING_TYPE_OPTIONS: {
  value: MarketListingType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'sell',
    label: 'Set a price',
    hint: 'Buyers check out instantly at your price',
  },
  {
    value: 'trade',
    label: 'Trade only',
    hint: 'Swap for another pair — no cash',
  },
  {
    value: 'vault',
    label: 'Accept offers',
    hint: 'Show it off, see what people offer',
  },
  {
    value: 'collection',
    label: 'Add to collection',
    hint: 'Display on your profile — not for sale',
  },
];

export function sellerListingTypeLabel(type: string): string {
  return SELLER_LISTING_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
