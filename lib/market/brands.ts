/** Seller dropdown + browse filter brands (wrestling-focused). */
export const MARKET_BRANDS = [
  'Adidas',
  'Asics',
  'Nike',
  'ONEV',
  'RUDIS',
  'Cronin',
  'Other',
] as const;

export type MarketBrand = (typeof MARKET_BRANDS)[number];

/** Browse filter brands (no "Other"). */
export const BROWSE_BRANDS = [
  'Adidas',
  'Asics',
  'Nike',
  'ONEV',
  'RUDIS',
  'Cronin',
] as const;

/** Brands that get wrestle-ready price floors when comps are sparse. */
export const MAJOR_WRESTLING_BRANDS = new Set<string>([
  'Adidas',
  'Asics',
  'Nike',
  'ONEV',
  'RUDIS',
  'Cronin',
]);

export function normalizeMarketBrand(brand: string): MarketBrand {
  const trimmed = brand.trim();
  const hit = MARKET_BRANDS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return hit ?? 'Other';
}
