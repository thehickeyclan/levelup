/**
 * The sold-price reference shown next to every ask — standards §6.1.
 *
 * "Asks on eBay run 2–5× sold prices; the reference is the antidote."
 * The card shows only when the evidence can stand behind it: at least 3
 * combined real sales (Guild + documented + IG sold) — the same n≥3
 * discipline as the condition-tier premium ratios. Roughly three-quarters
 * of the catalog qualifies on day one; the rest honestly shows nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMarketValueData } from '@/lib/market/market-value';
import { getIgPriceHistory, type IgModelHistory } from '@/lib/market/ig-price-history';
import { getConditionTiers, type ModelConditionTiers } from '@/lib/market/condition-tiers';
import { disclosureTagByCode } from '@/lib/market/disclosure-tags';

export type ValueReference = {
  mid_cents: number;
  low_cents: number | null;
  high_cents: number | null;
  confidence: 'high' | 'medium' | 'low';
  /** "From 3 Guild sales · 11 documented sales · 24 IG resale posts" */
  source_label: string;
  /** "Good-condition eBay median $250 (11 sales)" — null when no tier matches */
  detail_label: string | null;
  /** Set when the pair is modified: the reference prices the stock pair */
  stock_caveat: string | null;
};

const MIN_COMBINED_SALES = 3;
const MODIFYING_TAGS = new Set(['sole_swapped', 'custom_painted', 'custom_build', 'display_only']);

function tierForListing(
  tiers: ModelConditionTiers | null,
  wearState: string | null | undefined,
  condition: string | null | undefined
): { key: string; label: string; n: number; median_usd: number } | null {
  if (!tiers) return null;
  const key =
    wearState === 'bnib' || wearState === 'new_no_box'
      ? 'new'
      : condition === 'like_new'
        ? 'like_new'
        : condition === 'fair'
          ? 'worn'
          : 'good';
  const tier = tiers.tiers[key as keyof typeof tiers.tiers];
  if (!tier || tier.n < MIN_COMBINED_SALES) return null;
  const label = key === 'like_new' ? 'like-new' : key;
  return { key, label, n: tier.n, median_usd: tier.median_usd };
}

export function assembleValueReference(input: {
  marketValue: { low_cents: number; mid_cents: number; high_cents: number; confidence: 'high' | 'medium' | 'low' } | null;
  guildSales: number;
  documentedSales: number;
  ig: IgModelHistory | null;
  tiers: ModelConditionTiers | null;
  wearState?: string | null;
  condition?: string | null;
  disclosureTags?: string[] | null;
}): ValueReference | null {
  const igSold = input.ig?.sold_priced ?? 0;
  const combined = input.guildSales + input.documentedSales + igSold;
  if (combined < MIN_COMBINED_SALES) return null;

  const tier = tierForListing(input.tiers, input.wearState, input.condition);

  let mid: number;
  let low: number | null = null;
  let high: number | null = null;
  let confidence: ValueReference['confidence'];
  if (input.marketValue) {
    mid = input.marketValue.mid_cents;
    low = input.marketValue.low_cents;
    high = input.marketValue.high_cents;
    confidence = input.marketValue.confidence;
  } else if (tier) {
    mid = Math.round(tier.median_usd * 100);
    confidence = 'medium';
  } else if (input.ig?.median_usd != null) {
    mid = Math.round(input.ig.median_usd * 100);
    low = input.ig.min_usd != null ? Math.round(input.ig.min_usd * 100) : null;
    high = input.ig.max_usd != null ? Math.round(input.ig.max_usd * 100) : null;
    confidence = 'low';
  } else {
    return null;
  }

  const sourceParts = [
    input.guildSales ? `${input.guildSales} Guild sale${input.guildSales !== 1 ? 's' : ''}` : null,
    input.documentedSales
      ? `${input.documentedSales} documented sale${input.documentedSales !== 1 ? 's' : ''}`
      : null,
    igSold ? `${igSold} IG resale post${igSold !== 1 ? 's' : ''}` : null,
  ].filter(Boolean) as string[];

  const detailParts = [
    tier ? `${tier.label}-condition eBay median $${tier.median_usd} (${tier.n} sales)` : null,
    input.ig?.median_recent_24mo_usd != null
      ? `IG median $${input.ig.median_recent_24mo_usd} last 24 months`
      : null,
  ].filter(Boolean) as string[];

  const modifying = (input.disclosureTags ?? []).filter((t) => MODIFYING_TAGS.has(t));
  const stockCaveat = modifying.length
    ? `Stock-pair reference — this pair is ${modifying
        .map((t) => (disclosureTagByCode(t)?.label ?? t).toLowerCase())
        .join(', ')}; modified pairs trade on their own merits.`
    : null;

  return {
    mid_cents: mid,
    low_cents: low,
    high_cents: high,
    confidence,
    source_label: `From ${sourceParts.join(' · ')}`,
    detail_label: detailParts.length ? detailParts.join(' · ') : null,
    stock_caveat: stockCaveat,
  };
}

/** Fetch + assemble for a listing. Returns null when evidence is too thin. */
export async function fetchListingValueReference(
  admin: SupabaseClient,
  input: {
    brand: string | null | undefined;
    model: string | null | undefined;
    colorway?: string | null;
    wear_state?: string | null;
    condition?: string | null;
    disclosure_tags?: string[] | null;
    excludeListingId?: string | null;
  }
): Promise<ValueReference | null> {
  const brand = input.brand?.trim();
  const model = input.model?.trim();
  if (!brand || !model) return null;
  try {
    const market = await fetchMarketValueData(admin, {
      brand,
      model,
      colorway: input.colorway ?? null,
      excludeListingId: input.excludeListingId ?? null,
    });
    return assembleValueReference({
      marketValue: market.marketValue,
      guildSales: market.soldComps.length,
      documentedSales: market.documentedComps.length,
      ig: getIgPriceHistory(brand, model),
      tiers: getConditionTiers(brand, model),
      wearState: input.wear_state,
      condition: input.condition,
      disclosureTags: input.disclosure_tags,
    });
  } catch (e) {
    console.error('fetchListingValueReference:', e);
    return null;
  }
}
