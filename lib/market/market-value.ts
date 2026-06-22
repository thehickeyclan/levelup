import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriceAnalysis, PriceComp } from '@/lib/market/ai/schemas';
import type { SaleComp } from '@/lib/market/shoe-id/schemas';
import { buildCatalogPricingContext } from '@/lib/market/catalog-pricing';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import {
  catalogSaleCompsToPriceComps,
  fetchGuildPlatformComps,
} from '@/lib/market/platform-comps';
import { wearStateLabel } from '@/lib/market/wear-state';
import type { MarketWearState } from '@/lib/market/wear-state';

export type MarketValueRange = {
  low_cents: number;
  mid_cents: number;
  high_cents: number;
  confidence: 'high' | 'medium' | 'low';
  confidence_note: string;
  sold_count: number;
  documented_count: number;
  asking_count: number;
  asking_low_cents: number | null;
  asking_high_cents: number | null;
};

type ActiveListingRow = {
  id: string;
  price_cents: number | null;
  size: number | null;
  condition: string | null;
  wear_state: string | null;
  colorway: string | null;
  created_at: string;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo));
}

export function computeMarketValueRange(
  soldPricesCents: number[],
  askingPricesCents: number[] = [],
  opts?: { documentedPricesCents?: number[]; documentedOnly?: boolean }
): MarketValueRange | null {
  const guildSold = soldPricesCents.filter((p) => p > 0);
  const documented = (opts?.documentedPricesCents ?? []).filter((p) => p > 0);
  const asking = askingPricesCents.filter((p) => p > 0).sort((a, b) => a - b);

  let prices: number[];
  let confidence: 'high' | 'medium' | 'low';
  let confidence_note: string;

  if (guildSold.length >= 3) {
    prices = guildSold;
    confidence = guildSold.length >= 10 ? 'high' : 'medium';
    confidence_note = `Guild Market value from ${guildSold.length} completed sales on Guild.`;
  } else if (guildSold.length > 0 && documented.length > 0) {
    prices = [...guildSold, ...documented];
    confidence = 'medium';
    confidence_note = `${guildSold.length} Guild sale${guildSold.length !== 1 ? 's' : ''} plus ${documented.length} documented resale comp${documented.length !== 1 ? 's' : ''} (Instagram/handbook).`;
  } else if (guildSold.length > 0) {
    prices = guildSold;
    confidence = 'low';
    confidence_note =
      guildSold.length === 1
        ? 'One Guild sale so far — add IG comps in admin to sharpen the range.'
        : `Early Guild Market signal from ${guildSold.length} sales.`;
  } else if (documented.length > 0) {
    prices = documented;
    confidence = documented.length >= 5 ? 'medium' : 'low';
    confidence_note =
      documented.length >= 5
        ? `Market value from ${documented.length} documented resale sales (Instagram/handbook) — Guild checkout will refine over time.`
        : `Based on ${documented.length} documented resale sale${documented.length !== 1 ? 's' : ''} from admin training — early estimate until Guild sales accumulate.`;
  } else {
    return null;
  }

  const sorted = [...prices].sort((a, b) => a - b);

  let note = confidence_note;
  if (asking.length) {
    note += ` ${asking.length} pair${asking.length !== 1 ? 's' : ''} listed now on Guild at $${Math.round(asking[0]! / 100)}–$${Math.round(asking[asking.length - 1]! / 100)}.`;
  }

  return {
    low_cents: percentile(sorted, 0.25),
    mid_cents: percentile(sorted, 0.5),
    high_cents: percentile(sorted, 0.75),
    confidence,
    confidence_note: note,
    sold_count: guildSold.length,
    documented_count: documented.length,
    asking_count: asking.length,
    asking_low_cents: asking[0] ?? null,
    asking_high_cents: asking[asking.length - 1] ?? null,
  };
}

function formatAskingLabel(listing: ActiveListingRow): string {
  const bits: string[] = ['Listed now'];
  if (listing.size != null) bits.push(`size ${listing.size}`);
  if (listing.colorway?.trim()) bits.push(listing.colorway.trim());
  if (listing.condition) bits.push(listing.condition.replace('_', ' '));
  if (listing.wear_state) {
    bits.push(wearStateLabel(listing.wear_state as MarketWearState));
  }
  return bits.join(' · ');
}

/** Active sell listings on Guild for the same brand/model. */
export async function fetchGuildAskingComps(
  admin: SupabaseClient,
  brand: string,
  model: string,
  opts?: { excludeListingId?: string | null; limit?: number }
): Promise<PriceComp[]> {
  const brandTrim = brand.trim();
  const modelTrim = model.trim();
  if (!brandTrim || !modelTrim) return [];

  let query = admin
    .from('market_listings')
    .select('id, price_cents, size, condition, wear_state, colorway, created_at')
    .ilike('brand', brandTrim)
    .ilike('model', `%${modelTrim}%`)
    .eq('listing_type', 'sell')
    .eq('status', 'active')
    .not('price_cents', 'is', null)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 12);

  if (opts?.excludeListingId) {
    query = query.neq('id', opts.excludeListingId);
  }

  const { data } = await query;
  const rows = (data ?? []) as ActiveListingRow[];

  return rows
    .filter((row) => row.price_cents != null && row.price_cents > 0)
    .map((row) => ({
      source: 'guild_asking' as const,
      price_cents: row.price_cents as number,
      label: formatAskingLabel(row),
      date: row.created_at,
      size_us: row.size ?? undefined,
      colorway: row.colorway ?? undefined,
      condition: row.condition ?? undefined,
      wear_state: row.wear_state ?? undefined,
    }));
}

export type MarketValueInput = {
  brand: string;
  model: string;
  size?: number | null;
  colorway?: string | null;
  excludeListingId?: string | null;
};

export async function fetchMarketValueData(
  admin: SupabaseClient,
  input: MarketValueInput
): Promise<{
  soldComps: PriceComp[];
  askingComps: PriceComp[];
  documentedComps: PriceComp[];
  marketValue: MarketValueRange | null;
  colorwayProfile: import('@/lib/market/shoe-id/schemas').ColorwayProfile | null;
}> {
  const [soldComps, askingComps, catalogContext] = await Promise.all([
    fetchGuildPlatformComps(admin, input.brand, input.model, input.size),
    fetchGuildAskingComps(admin, input.brand, input.model, {
      excludeListingId: input.excludeListingId,
    }),
    buildCatalogPricingContext(
      admin,
      input.brand,
      input.model,
      input.colorway,
      input.size
    ),
  ]);

  const documentedComps = catalogSaleCompsToPriceComps(catalogContext.relevantSaleComps);
  const documentedPrices = documentedComps.map((c) => c.price_cents);

  const marketValue = computeMarketValueRange(
    soldComps.map((c) => c.price_cents),
    askingComps.map((c) => c.price_cents),
    { documentedPricesCents: documentedPrices }
  );

  return { soldComps, askingComps, documentedComps, marketValue, colorwayProfile: catalogContext.colorwayProfile };
}

export function priceAnalysisFromMarketValue(
  marketValue: MarketValueRange,
  comps: PriceComp[],
  marketNote?: string
): PriceAnalysis {
  return {
    suggested_low_cents: marketValue.low_cents,
    suggested_mid_cents: marketValue.mid_cents,
    suggested_high_cents: marketValue.high_cents,
    confidence: marketValue.confidence,
    confidence_note: marketValue.confidence_note,
    comps: comps.slice(0, 15),
    market_note:
      marketNote ||
      (marketValue.asking_count
        ? 'Range from Guild sales; active listings show what sellers are asking now.'
        : 'Guild Market value from completed sales on this model.'),
  };
}

function saleCompKey(comp: SaleComp): string {
  return [
    comp.sold_price_cents,
    comp.size_us ?? '',
    comp.colorway?.trim().toLowerCase() ?? '',
    comp.source ?? '',
  ].join('|');
}

/** Persist a completed Guild sale into catalog comps and refresh model value range. */
export async function recordCompletedGuildSale(
  admin: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order, error } = await admin
    .from('market_orders')
    .select(
      'id, amount_cents, delivered_at, status, market_listings(brand, model, size, condition, wear_state, colorway)'
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order || order.status !== 'completed') return;

  const rawListing = order.market_listings as
    | {
        brand: string;
        model: string;
        size: number | null;
        condition: string | null;
        wear_state: string | null;
        colorway: string | null;
      }
    | {
        brand: string;
        model: string;
        size: number | null;
        condition: string | null;
        wear_state: string | null;
        colorway: string | null;
      }[]
    | null;

  const listing = Array.isArray(rawListing) ? rawListing[0] : rawListing;
  if (!listing?.brand?.trim() || !listing.model?.trim()) return;

  const brand = listing.brand.trim();
  const model = listing.model.trim();
  const entry = (await findCatalogEntry(admin, brand, model)) as
    | (Record<string, unknown> & { id: string; sale_comps?: SaleComp[] | null })
    | null;

  const guildSold = await fetchGuildPlatformComps(admin, brand, model, listing.size, 30);
  const catalogContext = await buildCatalogPricingContext(
    admin,
    brand,
    model,
    listing.colorway,
    listing.size
  );
  const documentedPrices = catalogContext.relevantSaleComps.map((c) => c.sold_price_cents);
  const marketValue = computeMarketValueRange(
    guildSold.map((c) => c.price_cents),
    [],
    { documentedPricesCents: documentedPrices }
  );

  const deliveredAt = (order.delivered_at as string | null) ?? new Date().toISOString();
  const saleDate = deliveredAt.slice(0, 10);

  const newComp: SaleComp = {
    sold_price_cents: order.amount_cents as number,
    condition: listing.condition ?? undefined,
    source: 'Guild',
    colorway: listing.colorway ?? undefined,
    size_us: listing.size ?? undefined,
    notes: `Guild Market sale ${saleDate}`,
  };

  if (!entry?.id) return;

  const existingComps = (entry.sale_comps ?? []) as SaleComp[];
  const keys = new Set(existingComps.map(saleCompKey));
  const mergedComps =
    keys.has(saleCompKey(newComp)) ? existingComps : [...existingComps, newComp].slice(-25);

  const patch: Record<string, unknown> = {
    sale_comps: mergedComps,
    updated_at: new Date().toISOString(),
  };

  if (marketValue) {
    patch.value_low_cents = marketValue.low_cents;
    patch.value_mid_cents = marketValue.mid_cents;
    patch.value_high_cents = marketValue.high_cents;
  }

  await admin.from('wrestling_shoes_catalog').update(patch).eq('id', entry.id);
}

export { catalogSaleCompsToPriceComps };
