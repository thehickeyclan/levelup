import type { PriceAnalysis } from '@/lib/market/ai/schemas';

const MAJOR_BRANDS = new Set(['Adidas', 'Asics', 'Nike', 'New Balance']);

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
  if (opts.hasComps || opts.wearState !== 'used' || !MAJOR_BRANDS.has(opts.brand)) {
    return analysis;
  }

  const wrestle = opts.wrestleScore != null ? Math.round(opts.wrestleScore) : 5;
  const clamped = Math.min(10, Math.max(4, wrestle));

  // USD cents — wrestle-first floors for major-brand used wrestling shoes
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
