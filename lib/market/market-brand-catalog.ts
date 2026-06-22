import type { SupabaseClient } from '@supabase/supabase-js';
import { BROWSE_BRANDS, CORE_SELLER_BRANDS, OTHER_MARKET_BRAND } from '@/lib/market/brands';

export type MarketBrandCatalog = {
  sellerBrands: string[];
  browseBrands: string[];
  customBrands: string[];
};

function titleCaseBrand(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (word === word.toUpperCase() && word.length <= 5) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function mergeBrandLists(customBrands: string[]): MarketBrandCatalog {
  const coreLower = new Set(CORE_SELLER_BRANDS.map((b) => b.toLowerCase()));
  const custom = customBrands
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => b.toLowerCase() !== OTHER_MARKET_BRAND.toLowerCase())
    .filter((b) => !coreLower.has(b.toLowerCase()));

  const uniqueCustom = [...new Map(custom.map((b) => [b.toLowerCase(), b])).values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  return {
    customBrands: uniqueCustom,
    sellerBrands: [...CORE_SELLER_BRANDS, ...uniqueCustom, OTHER_MARKET_BRAND],
    browseBrands: [...BROWSE_BRANDS, ...uniqueCustom],
  };
}

export async function fetchCustomMarketBrandNames(
  supabase: SupabaseClient,
  tenantSlug: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('market_brands')
      .select('name')
      .eq('tenant_slug', tenantSlug)
      .order('name', { ascending: true });

    if (error) {
      if (error.message?.includes('market_brands')) return [];
      console.error('fetchCustomMarketBrandNames:', error);
      return [];
    }

    return (data ?? []).map((row) => String(row.name).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchMarketBrandCatalog(
  supabase: SupabaseClient,
  tenantSlug: string
): Promise<MarketBrandCatalog> {
  const custom = await fetchCustomMarketBrandNames(supabase, tenantSlug);
  return mergeBrandLists(custom);
}

export function resolveListingBrand(brand: string, catalog: MarketBrandCatalog): string {
  const trimmed = brand.trim();
  if (!trimmed) return OTHER_MARKET_BRAND;

  const hit = catalog.sellerBrands.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return hit ?? OTHER_MARKET_BRAND;
}

export function normalizeNewBrandName(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 40) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 \-&'.]*$/.test(cleaned)) return null;
  if (cleaned.toLowerCase() === OTHER_MARKET_BRAND.toLowerCase()) return null;
  return titleCaseBrand(cleaned);
}

export function brandNameAlreadyExists(name: string, catalog: MarketBrandCatalog): boolean {
  const lower = name.toLowerCase();
  return catalog.sellerBrands.some((b) => b.toLowerCase() === lower);
}
