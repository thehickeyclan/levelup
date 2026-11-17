/**
 * The stale-listing reprice nudge — the seller half of standards §6.1.
 *
 * Fires only where the evidence can stand behind it. The gates, in order of
 * how often they will save us from a wrong nudge:
 *  - no reference, or low-confidence reference → silent (thin data)
 *  - ask within 1.5× the reference → silent (fairly priced)
 *  - brand/model not in the catalog → silent (a filing problem, not a price
 *    problem — nudging a misfiled listing teaches sellers to ignore nudges)
 *  - modified pair (stock caveat set) → silent (trades on its own merits)
 *  - the model has premium colorways and this listing's colorway is either
 *    unprofiled or premium-without-curated-values → silent (a David Taylor
 *    CS4 at 3× the pooled reference is correctly priced)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ColorwayProfile } from '@/lib/market/shoe-id/schemas';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import {
  matchColorwayProfile,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';
import {
  fetchListingValueReference,
  type ValueReference,
} from '@/lib/market/value-reference';

export const REPRICE_NUDGE_RATIO = 1.5;
const PREMIUM_TIERS = new Set(['uncommon', 'rare', 'grail']);

export type RepriceVerdict =
  | { fire: false; reason: string }
  | { fire: true; ratio: number; reference: ValueReference };

function profileHasCuratedValue(profile: ColorwayProfile): boolean {
  return (
    profile.value_mid_cents != null ||
    (profile.value_low_cents != null && profile.value_high_cents != null)
  );
}

function profileIsPremium(profile: ColorwayProfile): boolean {
  return (
    PREMIUM_TIERS.has(profile.value_tier ?? '') || profile.availability === 'grail'
  );
}

export function evaluateRepriceNudge(input: {
  priceCents: number | null | undefined;
  reference: ValueReference | null;
  catalogMatched: boolean;
  profiles: ColorwayProfile[];
  matchedProfile: ColorwayProfile | null;
}): RepriceVerdict {
  const price = input.priceCents ?? 0;
  if (price <= 0) return { fire: false, reason: 'no ask price' };
  if (!input.reference) return { fire: false, reason: 'no reference' };
  if (input.reference.confidence === 'low') {
    return { fire: false, reason: 'low-confidence reference' };
  }
  const ratio = price / input.reference.mid_cents;
  if (ratio <= REPRICE_NUDGE_RATIO) return { fire: false, reason: 'within range' };
  if (!input.catalogMatched) {
    return { fire: false, reason: 'not filed to a catalog model' };
  }
  if (input.reference.stock_caveat) {
    return { fire: false, reason: 'modified pair trades on its own merits' };
  }

  const premiumExists = input.profiles.some(profileIsPremium);
  if (premiumExists) {
    const matched = input.matchedProfile;
    if (!matched) {
      return {
        fire: false,
        reason: 'model has premium colorways and this colorway is unprofiled',
      };
    }
    if (profileIsPremium(matched) && !profileHasCuratedValue(matched)) {
      return {
        fire: false,
        reason: 'premium colorway without a curated value',
      };
    }
    // Matched a common-tier profile, or a premium one whose curated value is
    // already what the reference priced — the premium does not explain the ask.
  }

  return { fire: true, ratio, reference: input.reference };
}

/**
 * Nudge copy — eBay sold prices where they exist (a seller can push back on
 * an IG median in a way they can't on a sold comp), IG cited for volume only.
 * Facts and a path forward; never a scolding.
 */
export function repriceNudgeCopy(
  listingTitle: string,
  priceCents: number,
  verdict: Extract<RepriceVerdict, { fire: true }>
): { title: string; body: string } {
  const ref = verdict.reference;
  const ask = Math.round(priceCents / 100);
  const mid = Math.round(ref.mid_cents / 100);
  const evidence = [ref.detail_label, ref.source_label].filter(Boolean).join(' · ');
  return {
    title: `${listingTitle} may be priced above the market`,
    body:
      `Your $${ask} ask is about ${verdict.ratio.toFixed(1)}× the Guild reference of ~$${mid}. ` +
      (evidence ? `${evidence}. ` : '') +
      'Pairs priced near the reference sell much faster — tap to review your price.',
  };
}

export type RepriceEvaluation = {
  reference: ValueReference | null;
  verdict: RepriceVerdict;
};

/** Fetch everything and evaluate one listing. Never throws. */
export async function fetchRepriceEvaluation(
  admin: SupabaseClient,
  listing: {
    id: string;
    brand: string | null | undefined;
    model: string | null | undefined;
    colorway?: string | null;
    price_cents?: number | null;
    wear_state?: string | null;
    condition?: string | null;
    disclosure_tags?: string[] | null;
  }
): Promise<RepriceEvaluation> {
  try {
    const brand = listing.brand?.trim();
    const model = listing.model?.trim();
    if (!brand || !model) {
      return { reference: null, verdict: { fire: false, reason: 'no brand/model' } };
    }
    const [reference, entry] = await Promise.all([
      fetchListingValueReference(admin, {
        brand,
        model,
        colorway: listing.colorway ?? null,
        wear_state: listing.wear_state ?? null,
        condition: listing.condition ?? null,
        disclosure_tags: listing.disclosure_tags ?? null,
        excludeListingId: listing.id,
      }),
      findCatalogEntry(admin, brand, model),
    ]);
    const profiles = entry ? parseColorwayProfiles(entry.colorway_profiles) : [];
    const matchedProfile = matchColorwayProfile(profiles, listing.colorway ?? null);
    const verdict = evaluateRepriceNudge({
      priceCents: listing.price_cents,
      reference,
      catalogMatched: entry != null,
      profiles,
      matchedProfile,
    });
    return { reference, verdict };
  } catch (e) {
    console.error('fetchRepriceEvaluation:', e);
    return { reference: null, verdict: { fire: false, reason: 'evaluation failed' } };
  }
}
