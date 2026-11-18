/**
 * The sold-price reference shown next to every ask — standards §6.1, gated
 * per the 2026-11-18 pricing audit.
 *
 * "Asks on eBay run 2–5× sold prices; the reference is the antidote."
 * A headline number shows only when the reference pool is variant-matched,
 * unflagged, and deep enough. Everywhere else the card shows the evidence
 * instead of a number: the tier medians with their n, the IG sold median
 * with its n, the last documented sale — and says plainly when there is
 * not enough verified evidence to value the variant. A missing value is a
 * gap; a wrong value is the platform lying at scale.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMarketValueData } from '@/lib/market/market-value';
import { getIgPriceHistory, type IgModelHistory } from '@/lib/market/ig-price-history';
import { getConditionTiers, type ModelConditionTiers } from '@/lib/market/condition-tiers';
import { disclosureTagByCode } from '@/lib/market/disclosure-tags';
import type { ColorwayProfile, SaleComp } from '@/lib/market/shoe-id/schemas';

export type ValueReference = {
  mid_cents: number;
  low_cents: number | null;
  high_cents: number | null;
  confidence: 'high' | 'medium' | 'low';
  /** "From 3 Guild sales · 19 documented sales · 24 IG resale posts" */
  source_label: string;
  /** "Good-condition eBay median $250 (11 sales)" — null when no tier matches */
  detail_label: string | null;
  /** Set when the pair is modified: the reference prices the stock pair */
  stock_caveat: string | null;
};

/** Shown in place of a number when the evidence can't earn a headline. */
export type ValueEvidence = {
  /** Why there is no number — honest, one sentence. */
  reason: string;
  /** The evidence itself: tier medians, IG median, last documented sale. */
  lines: string[];
  source_label: string;
  stock_caveat: string | null;
};

export type ValueAssessment = {
  reference: ValueReference | null;
  evidence: ValueEvidence | null;
};

const MIN_COMBINED_SALES = 3;
/** Never anchor a headline on a condition tier thinner than this. */
const TIER_ANCHOR_MIN_N = 5;
/** IG point reference needs at least this many priced sold posts. */
const IG_ANCHOR_MIN_N = 10;
const MODIFYING_TAGS = new Set(['sole_swapped', 'custom_painted', 'custom_build', 'display_only']);
const PREMIUM_TIERS = new Set(['uncommon', 'rare', 'grail']);

type TierPick = { key: string; label: string; n: number; median_usd: number };

const TIER_LABELS: Record<string, string> = {
  new: 'new',
  like_new: 'like-new',
  good: 'good',
  worn: 'worn',
};

function wearTierKey(
  wearState: string | null | undefined,
  condition: string | null | undefined
): 'new' | 'like_new' | 'good' | 'worn' {
  if (wearState === 'bnib' || wearState === 'new_no_box') return 'new';
  if (condition === 'like_new') return 'like_new';
  if (condition === 'fair') return 'worn';
  return 'good';
}

function pickTier(tiers: ModelConditionTiers | null, key: string): TierPick | null {
  const tier = tiers?.tiers[key as keyof NonNullable<typeof tiers>['tiers']];
  if (!tier) return null;
  return { key, label: TIER_LABELS[key] ?? key, n: tier.n, median_usd: tier.median_usd };
}

/** The deepest tier on the model — the pool the evidence actually lives in. */
function deepestTier(tiers: ModelConditionTiers | null, exclude?: Set<string>): TierPick | null {
  if (!tiers) return null;
  let best: TierPick | null = null;
  for (const key of Object.keys(tiers.tiers)) {
    if (exclude?.has(key)) continue;
    const t = pickTier(tiers, key);
    if (t && (!best || t.n > best.n)) best = t;
  }
  return best;
}

function isPremiumProfile(profile: ColorwayProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    (profile.value_tier != null && PREMIUM_TIERS.has(profile.value_tier)) ||
    profile.availability === 'grail'
  );
}

function profileCuratedMid(profile: ColorwayProfile | null | undefined): number | null {
  if (!profile) return null;
  return (
    profile.value_mid_cents ??
    (profile.value_low_cents != null && profile.value_high_cents != null
      ? Math.round((profile.value_low_cents + profile.value_high_cents) / 2)
      : null)
  );
}

export type ValueAssessmentInput = {
  marketValue: {
    low_cents: number;
    mid_cents: number;
    high_cents: number;
    confidence: 'high' | 'medium' | 'low';
  } | null;
  guildSales: number;
  documentedSales: number;
  ig: IgModelHistory | null;
  tiers: ModelConditionTiers | null;
  wearState?: string | null;
  condition?: string | null;
  disclosureTags?: string[] | null;
  /** Matched colorway/variant profile from the catalog — curated values win. */
  colorwayProfile?: ColorwayProfile | null;
  /** Most recent documented sale, for the evidence card. */
  lastDocumentedSale?: { price_cents: number; label: string | null } | null;
  /** Live manufacturer price when the model is still in production. */
  currentRetail?: { cents: number; source: string | null } | null;
};

/** The live retail anchor: the matched colorway's beats the model's. */
function effectiveRetail(
  input: ValueAssessmentInput
): { cents: number; source: string | null } | null {
  const profile = input.colorwayProfile;
  if (profile?.availability === 'current_retail' && profile.retail_anchor_cents) {
    return { cents: profile.retail_anchor_cents, source: input.currentRetail?.source ?? null };
  }
  return input.currentRetail ?? null;
}

function retailLine(input: ValueAssessmentInput): string | null {
  const retail = effectiveRetail(input);
  if (!retail) return null;
  return `Still at retail — $${Math.round(retail.cents / 100)}${retail.source ? ` at ${retail.source}` : ''}`;
}

function buildSourceLabel(input: ValueAssessmentInput): string {
  const igSold = input.ig?.sold_priced ?? 0;
  const parts = [
    input.guildSales ? `${input.guildSales} Guild sale${input.guildSales !== 1 ? 's' : ''}` : null,
    input.documentedSales
      ? `${input.documentedSales} documented sale${input.documentedSales !== 1 ? 's' : ''}`
      : null,
    igSold ? `${igSold} IG resale post${igSold !== 1 ? 's' : ''}` : null,
  ].filter(Boolean) as string[];
  return parts.length ? `From ${parts.join(' · ')}` : 'No verified sales recorded';
}

function buildStockCaveat(input: ValueAssessmentInput): string | null {
  const modifying = (input.disclosureTags ?? []).filter((t) => MODIFYING_TAGS.has(t));
  return modifying.length
    ? `Stock-pair reference — this pair is ${modifying
        .map((t) => (disclosureTagByCode(t)?.label ?? t).toLowerCase())
        .join(', ')}; modified pairs trade on their own merits.`
    : null;
}

function igMedianLine(ig: IgModelHistory | null): string | null {
  if (!ig) return null;
  const sold = ig.sold_priced ?? 0;
  if (ig.median_recent_24mo_usd != null) {
    return `IG sold median $${ig.median_recent_24mo_usd} last 24 months${sold ? ` (${sold} priced)` : ''}`;
  }
  if (ig.median_usd != null && sold) {
    return `IG sold median $${ig.median_usd} (${sold} priced)`;
  }
  return null;
}

function evidenceLines(input: ValueAssessmentInput): string[] {
  const lines: string[] = [];
  const retail = retailLine(input);
  if (retail) lines.push(retail);
  const tiers = input.tiers;
  if (tiers) {
    const parts = Object.keys(tiers.tiers)
      .map((k) => pickTier(tiers, k))
      .filter((t): t is TierPick => t != null)
      .map((t) => `${t.label} $${t.median_usd} (${t.n})`);
    if (parts.length) lines.push(`eBay sold by condition: ${parts.join(', ')}`);
  }
  const ig = igMedianLine(input.ig);
  if (ig) lines.push(ig);
  if (input.lastDocumentedSale) {
    const label = input.lastDocumentedSale.label?.trim();
    lines.push(
      `Last documented sale $${Math.round(input.lastDocumentedSale.price_cents / 100)}${label ? ` (${label})` : ''}`
    );
  }
  return lines;
}

function evidenceOnly(
  input: ValueAssessmentInput,
  reason: string,
  extraLines: string[] = []
): ValueAssessment {
  return {
    reference: null,
    evidence: {
      reason,
      lines: [...extraLines, ...evidenceLines(input)],
      source_label: buildSourceLabel(input),
      stock_caveat: buildStockCaveat(input),
    },
  };
}

function reference(
  input: ValueAssessmentInput,
  mid: number,
  low: number | null,
  high: number | null,
  confidence: ValueReference['confidence'],
  detailParts: (string | null)[]
): ValueAssessment {
  if (confidence === 'low') {
    low = null;
    high = null;
  }
  const details = detailParts.filter(Boolean) as string[];
  return {
    reference: {
      mid_cents: mid,
      low_cents: low,
      high_cents: high,
      confidence,
      source_label: buildSourceLabel(input),
      detail_label: details.length ? details.join(' · ') : null,
      stock_caveat: buildStockCaveat(input),
    },
    evidence: null,
  };
}

/**
 * Audit rule: the headline must not sit 3×+ below the IG sold median printed
 * on the same card. When it would, the pools disagree about what the model
 * is — generations or variants are mixed — and the honest card is evidence.
 */
function igContradicts(mid_cents: number, ig: IgModelHistory | null): boolean {
  if (!ig || (ig.sold_priced ?? 0) < IG_ANCHOR_MIN_N) return false;
  const igMed = ig.median_recent_24mo_usd ?? ig.median_usd;
  if (igMed == null) return false;
  return mid_cents * 3 <= igMed * 100;
}

export function assembleValueAssessment(input: ValueAssessmentInput): ValueAssessment {
  const igSold = input.ig?.sold_priced ?? 0;
  const combined = input.guildSales + input.documentedSales + igSold;
  const profile = input.colorwayProfile ?? null;
  const curatedMid = profileCuratedMid(profile);
  const premium = isPremiumProfile(profile);

  // 1. Curated variant values beat every pool — they exist precisely where
  // the pools don't price the variant (Cronin re-makes, OG generations).
  if (profile && curatedMid != null) {
    const tierLabel = profile.value_tier ?? (profile.availability === 'grail' ? 'grail' : null);
    return reference(input, curatedMid, profile.value_low_cents ?? null, profile.value_high_cents ?? null, 'medium', [
      `"${profile.name}" colorway${tierLabel ? ` — ${tierLabel} tier` : ''}, curated collector value`,
      igMedianLine(input.ig),
    ]);
  }

  const flag = input.tiers?.condition_flag?.trim() || null;
  const wearKey = wearTierKey(input.wearState, input.condition);

  // 1b. A model still in production prices itself: a new pair of a standard
  // colorway is worth the manufacturer's live price, no sales pool needed.
  // Premium colorways of current models are the exception — the retail page
  // doesn't sell those, so they fall through to the variant branches.
  const retail = effectiveRetail(input);
  if (retail && wearKey === 'new' && !premium) {
    return reference(input, retail.cents, null, null, 'high', [
      `Still at retail — $${Math.round(retail.cents / 100)}${retail.source ? ` at ${retail.source}` : ''}`,
      igMedianLine(input.ig),
    ]);
  }

  if (combined < MIN_COMBINED_SALES) {
    if (retail) {
      // Used pair of a current model with no sales history: retail is the
      // honest ceiling, shown as evidence rather than invented as a value.
      return evidenceOnly(input, 'No verified used-pair sales for this model yet — retail is the ceiling.');
    }
    return { reference: null, evidence: null };
  }

  const matchedTier = pickTier(input.tiers ?? null, wearKey);
  const premiumNote = premium
    ? `"${profile!.name}" colorway — ${profile!.value_tier ?? 'grail'} tier, sits at or above this reference`
    : null;

  // 2. A flagged model (INVERTED…) must never price from the new/like-new
  // tier: the used pool carries the rare colorways. Anchor on the deepest
  // used-side tier instead.
  if (flag) {
    const usedAnchor = deepestTier(input.tiers ?? null, new Set(['new', 'like_new']));
    if (usedAnchor && usedAnchor.n >= TIER_ANCHOR_MIN_N) {
      return reference(input, Math.round(usedAnchor.median_usd * 100), null, null, 'medium', [
        `${usedAnchor.label}-condition eBay median $${usedAnchor.median_usd} (${usedAnchor.n} sales) — inverted model: the used pool carries the premium colorways`,
        premiumNote,
        igMedianLine(input.ig),
      ]);
    }
    return evidenceOnly(
      input,
      'This model\'s pools are condition-flagged and too thin to anchor a value.'
    );
  }

  // 3. A premium colorway without curated values: the pooled stats price the
  // standard colorways, not this one. Evidence, never a wrong number.
  if (premium) {
    return evidenceOnly(
      input,
      `Not enough verified sales to value the "${profile!.name}" colorway — the pooled stats price the standard colorways.`,
      profile!.notes ? [profile!.notes] : []
    );
  }

  // 4. Condition-matched tier, deep enough to anchor.
  if (matchedTier && matchedTier.n >= TIER_ANCHOR_MIN_N) {
    const mid = Math.round(matchedTier.median_usd * 100);
    if (igContradicts(mid, input.ig)) {
      return evidenceOnly(
        input,
        'The eBay pool and the IG sold market disagree 3×+ — the pool likely mixes generations or variants.'
      );
    }
    return reference(input, mid, null, null, 'medium', [
      `${matchedTier.label}-condition eBay median $${matchedTier.median_usd} (${matchedTier.n} sales)`,
      retailLine(input),
      igMedianLine(input.ig),
    ]);
  }

  // 5. The matched tier is thin but a deeper pool exists on the same model —
  // never anchor on the thin slice (audit case: DGU new n=2 vs good n=31).
  const deep = deepestTier(input.tiers ?? null);
  if (deep && deep.n >= TIER_ANCHOR_MIN_N) {
    const mid = Math.round(deep.median_usd * 100);
    if (igContradicts(mid, input.ig)) {
      return evidenceOnly(
        input,
        'The eBay pool and the IG sold market disagree 3×+ — the pool likely mixes generations or variants.'
      );
    }
    const mismatch =
      deep.key !== wearKey
        ? wearKey === 'new'
          ? 'this pair is new and trades at or above the used reference'
          : `this pair is ${TIER_LABELS[wearKey] ?? wearKey}`
        : null;
    return reference(input, mid, null, null, 'medium', [
      `${deep.label}-condition eBay median $${deep.median_usd} (${deep.n} sales)${mismatch ? ` — ${mismatch}` : ''}`,
      retailLine(input),
      igMedianLine(input.ig),
    ]);
  }

  // 6. Pooled Guild + documented value — only when it isn't thin.
  if (input.marketValue && input.marketValue.confidence !== 'low') {
    const mv = input.marketValue;
    if (igContradicts(mv.mid_cents, input.ig)) {
      return evidenceOnly(
        input,
        'The documented pool and the IG sold market disagree 3×+ — the pool likely mixes generations or variants.'
      );
    }
    return reference(input, mv.mid_cents, mv.low_cents, mv.high_cents, mv.confidence, [
      retailLine(input),
      igMedianLine(input.ig),
    ]);
  }

  // 7. IG sold pool as the point reference when it's the deep pool.
  if (input.ig?.median_usd != null && igSold >= IG_ANCHOR_MIN_N) {
    return reference(input, Math.round(input.ig.median_usd * 100), null, null, 'low', [
      igMedianLine(input.ig),
    ]);
  }

  // 8. Something exists but nothing earns a headline.
  return evidenceOnly(input, 'Not enough verified sales to value this variant.');
}

/** Back-compat: the reference alone (callers that can't render evidence). */
export function assembleValueReference(input: ValueAssessmentInput): ValueReference | null {
  return assembleValueAssessment(input).reference;
}

export type ListingValueInput = {
  brand: string | null | undefined;
  model: string | null | undefined;
  colorway?: string | null;
  wear_state?: string | null;
  condition?: string | null;
  disclosure_tags?: string[] | null;
  excludeListingId?: string | null;
};

/** Fetch + assemble for a listing: the reference, or the evidence card. */
export async function fetchListingValueAssessment(
  admin: SupabaseClient,
  input: ListingValueInput
): Promise<ValueAssessment> {
  const brand = input.brand?.trim();
  const model = input.model?.trim();
  if (!brand || !model) return { reference: null, evidence: null };
  try {
    const market = await fetchMarketValueData(admin, {
      brand,
      model,
      colorway: input.colorway ?? null,
      excludeListingId: input.excludeListingId ?? null,
    });
    const lastComp = (market.allSaleComps ?? []).reduce<SaleComp | null>((best, c) => {
      if (!c?.sold_price_cents) return best;
      if (!best) return c;
      const a = ('sold_date' in c ? (c as { sold_date?: string }).sold_date : undefined) ?? '';
      const b = ('sold_date' in best ? (best as { sold_date?: string }).sold_date : undefined) ?? '';
      return a > b ? c : best;
    }, null);
    return assembleValueAssessment({
      marketValue: market.marketValue,
      guildSales: market.soldComps.length,
      // The card's count must equal the stored comp count, not the filtered
      // slice the pricing math uses — audit ask C.
      documentedSales: market.allSaleComps?.length ?? market.documentedComps.length,
      ig: getIgPriceHistory(brand, model),
      tiers: getConditionTiers(brand, model),
      wearState: input.wear_state,
      condition: input.condition,
      disclosureTags: input.disclosure_tags,
      colorwayProfile: market.colorwayProfile,
      currentRetail: market.currentRetail,
      lastDocumentedSale: lastComp
        ? {
            price_cents: lastComp.sold_price_cents,
            label:
              [lastComp.colorway, lastComp.condition].filter(Boolean).join(', ') || null,
          }
        : null,
    });
  } catch (e) {
    console.error('fetchListingValueAssessment:', e);
    return { reference: null, evidence: null };
  }
}

/** Back-compat wrapper: reference-or-null, as before the evidence card. */
export async function fetchListingValueReference(
  admin: SupabaseClient,
  input: ListingValueInput
): Promise<ValueReference | null> {
  return (await fetchListingValueAssessment(admin, input)).reference;
}
