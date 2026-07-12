import type { MarketWearState } from '@/lib/market/wear-state';

export const CONDITION_BREAKDOWN_KEYS = ['sole', 'upper', 'midsole', 'laces'] as const;

export type ListingConditionBreakdown = Partial<
  Record<(typeof CONDITION_BREAKDOWN_KEYS)[number], { score: number; note?: string }>
>;

export type ListingConditionRead = {
  wrestle_score: number;
  grade: string;
  breakdown: ListingConditionBreakdown;
  summary?: string | null;
  listing_tip?: string | null;
};

type AiAnalysisRow = {
  condition_score?: number | null;
  condition_grade_suggested?: string | null;
  condition_breakdown?: ListingConditionBreakdown | null;
  condition_summary?: string | null;
  listing_tip?: string | null;
  analyzed_at?: string | null;
};

export function extractListingConditionRead(
  listing: Record<string, unknown>,
  wearState: MarketWearState
): ListingConditionRead | null {
  if (wearState !== 'used') return null;

  const raw = listing.market_ai_analysis as AiAnalysisRow | AiAnalysisRow[] | null | undefined;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row?.analyzed_at || row.condition_score == null || !row.condition_grade_suggested) {
    return null;
  }

  return {
    wrestle_score: Number(row.condition_score),
    grade: String(row.condition_grade_suggested),
    breakdown: (row.condition_breakdown as ListingConditionBreakdown) ?? {},
    summary: row.condition_summary ?? null,
    listing_tip: row.listing_tip ?? null,
  };
}

export function gradeDisplay(grade: string): string {
  return grade.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
