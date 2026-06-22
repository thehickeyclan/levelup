/** Seller dropdown + browse filter brands (wrestling-focused). */
export const CORE_SELLER_BRANDS = [
  'Adidas',
  'Asics',
  'Nike',
  'ONEV',
  'RUDIS',
  'Cronin',
] as const;

export const OTHER_MARKET_BRAND = 'Other';

export const MARKET_BRANDS = [...CORE_SELLER_BRANDS, OTHER_MARKET_BRAND] as const;

export type MarketBrand = (typeof MARKET_BRANDS)[number];

/** Browse filter brands (no "Other"). */
export const BROWSE_BRANDS = [...CORE_SELLER_BRANDS] as const;

/** Brands that get wrestle-ready price floors when comps are sparse. */
export const MAJOR_WRESTLING_BRANDS = new Set<string>([...CORE_SELLER_BRANDS]);

export function normalizeMarketBrand(brand: string): MarketBrand {
  const trimmed = brand.trim();
  const hit = MARKET_BRANDS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return hit ?? 'Other';
}
