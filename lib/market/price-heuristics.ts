import type { PriceAnalysis } from '@/lib/market/ai/schemas';
import type { ColorwayProfile } from '@/lib/market/shoe-id/schemas';
import { MAJOR_WRESTLING_BRANDS } from '@/lib/market/brands';

/** Peak adult wrestling sizes (~9–11.5); smaller/larger sizes trade at a discount. */
export function sizePriceMultiplier(sizeUs?: number | null): number {
  if (sizeUs == null || Number.isNaN(sizeUs)) return 1;
  const size = sizeUs;
  if (size >= 9 && size <= 11.5) return 1;
  if (size >= 8 && size < 9) return 0.92;
  if (size >= 7 && size < 8) return 0.85;
  if (size < 7) return 0.72;
  if (size > 11.5 && size <= 12.5) return 0.88;
  if (size <= 13.5) return 0.75;
  return 0.62;
}

function scalePriceAnalysis(analysis: PriceAnalysis, multiplier: number): PriceAnalysis {
  if (multiplier === 1) return analysis;
  const scale = (cents: number) => Math.max(500, Math.round(cents * multiplier));
  return {
    ...analysis,
    suggested_low_cents: scale(analysis.suggested_low_cents),
    suggested_mid_cents: scale(analysis.suggested_mid_cents),
    suggested_high_cents: scale(analysis.suggested_high_cents),
    market_note: [
      analysis.market_note,
      `Adjusted for size (${multiplier.toFixed(2)}x vs peak 9–11.5 demand).`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function anchorFromColorwayProfile(profile: ColorwayProfile): number | null {
  if (profile.value_mid_cents != null) return profile.value_mid_cents;
  if (profile.value_low_cents != null && profile.value_high_cents != null) {
    return Math.round((profile.value_low_cents + profile.value_high_cents) / 2);
  }
  return null;
}

/** Blend AI output toward catalog colorway anchor when we have structured data. */
export function applyCatalogColorwayAnchor(
  analysis: PriceAnalysis,
  profile: ColorwayProfile | null
): PriceAnalysis {
  if (!profile) return analysis;

  const anchor = anchorFromColorwayProfile(profile);
  if (anchor == null) {
    if (profile.availability === 'current_retail' && profile.retail_anchor_cents) {
      const retail = profile.retail_anchor_cents;
      const usedMid = Math.round(retail * 0.75);
      if (analysis.suggested_mid_cents > retail * 1.15) {
        return {
          ...analysis,
          suggested_mid_cents: usedMid,
          suggested_low_cents: Math.round(usedMid * 0.85),
          suggested_high_cents: Math.round(usedMid * 1.12),
          confidence: analysis.confidence === 'high' ? 'medium' : analysis.confidence,
          market_note: [
            analysis.market_note,
            `${profile.name} is current retail (~$${Math.round(retail / 100)}); used pricing stays near retail unless unworn/grail.`,
          ]
            .filter(Boolean)
            .join(' '),
        };
      }
    }
    return analysis;
  }

  const isPremium =
    profile.availability === 'discontinued' ||
    profile.availability === 'grail' ||
    profile.availability === 'limited' ||
    profile.value_tier === 'rare' ||
    profile.value_tier === 'grail';

  const blendWeight = isPremium ? 0.55 : 0.35;
  const blendMid = Math.round(
    analysis.suggested_mid_cents * (1 - blendWeight) + anchor * blendWeight
  );

  return {
    ...analysis,
    suggested_mid_cents: blendMid,
    suggested_low_cents: Math.round(blendMid * 0.85),
    suggested_high_cents: Math.round(blendMid * (isPremium ? 1.25 : 1.12)),
    confidence: analysis.confidence === 'high' ? 'medium' : analysis.confidence,
    confidence_note: analysis.confidence_note || `Weighted toward catalog ${profile.name} colorway data.`,
    market_note: [
      analysis.market_note,
      `Catalog colorway anchor (${profile.name}): ~$${Math.round(anchor / 100)}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export function applySizeAndCatalogPricing(
  analysis: PriceAnalysis,
  opts: {
    sizeUs?: number | null;
    colorwayProfile?: ColorwayProfile | null;
  }
): PriceAnalysis {
  let result = applyCatalogColorwayAnchor(analysis, opts.colorwayProfile ?? null);
  result = scalePriceAnalysis(result, sizePriceMultiplier(opts.sizeUs));
  return result;
}

/** When no comps exist, prevent cosmetic-heavy underpricing for functional used wrestling shoes. */
export function applyUsedWrestlePriceFloor(
  analysis: PriceAnalysis,
  opts: {
    wearState: string;
    wrestleScore?: number | null;
    hasComps: boolean;
    brand: string;
  }
): PriceAnalysis {
  if (opts.hasComps || opts.wearState !== 'used' || !MAJOR_WRESTLING_BRANDS.has(opts.brand)) {
    return analysis;
  }

  const wrestle = opts.wrestleScore != null ? Math.round(opts.wrestleScore) : 5;
  const clamped = Math.min(10, Math.max(4, wrestle));

  const floorMidByWrestle: Record<number, number> = {
    4: 4500,
    5: 6500,
    6: 8000,
    7: 9000,
    8: 10500,
    9: 12500,
    10: 15000,
  };

  const floorMid = floorMidByWrestle[clamped] ?? 6000;
  if (analysis.suggested_mid_cents >= floorMid) return analysis;

  return {
    ...analysis,
    suggested_mid_cents: floorMid,
    suggested_low_cents: Math.round(floorMid * 0.85),
    suggested_high_cents: Math.round(floorMid * 1.15),
    confidence: 'low',
    confidence_note:
      'No live comps — range adjusted for wrestle-ready condition (appearance weighted less on Guild). Add EBAY_API_KEY or wait for Guild sales for tighter pricing.',
    market_note:
      analysis.market_note ||
      'Parents buy to wrestle; yellowing on white shoes is common and should not drive price to generic sneaker resale levels.',
  };
}
