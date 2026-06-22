import { z } from 'zod';
import { gradeFromWrestleScore, calibrateGuildConditionScores } from '@/lib/market/condition-grade';
import type { MarketWearState } from '@/lib/market/wear-state';

export const ConditionBreakdownSchema = z.object({
  sole: z.object({ score: z.number(), note: z.string() }).optional(),
  upper: z.object({ score: z.number(), note: z.string() }).optional(),
  midsole: z.object({ score: z.number(), note: z.string() }).optional(),
  laces: z.object({ score: z.number(), note: z.string() }).optional(),
});

const ConditionAnalysisRawSchema = z.object({
  wrestle_score: z.number().min(1).max(10).optional(),
  cosmetic_score: z.number().min(1).max(10).optional(),
  /** Legacy single score — treated as wrestle_score */
  score: z.number().min(1).max(10).optional(),
  grade: z.enum(['new', 'like_new', 'good', 'fair']).optional(),
  summary: z.string(),
  cosmetic_summary: z.string().optional(),
  breakdown: ConditionBreakdownSchema,
  listing_tip: z.string().optional(),
});

export type ConditionAnalysis = {
  wrestle_score: number;
  cosmetic_score: number;
  grade: 'new' | 'like_new' | 'good' | 'fair';
  summary: string;
  cosmetic_summary: string;
  breakdown: z.infer<typeof ConditionBreakdownSchema>;
  listing_tip?: string;
};

export const ConditionAnalysisSchema = ConditionAnalysisRawSchema.transform((raw): ConditionAnalysis => {
  const rawWrestle = raw.wrestle_score ?? raw.score ?? 5;
  const rawCosmetic = raw.cosmetic_score ?? rawWrestle;
  const { wrestle_score, cosmetic_score } = calibrateGuildConditionScores(rawWrestle, rawCosmetic);
  return {
    wrestle_score,
    cosmetic_score,
    grade: gradeFromWrestleScore(wrestle_score),
    summary: raw.summary,
    cosmetic_summary: raw.cosmetic_summary?.trim() || '',
    breakdown: raw.breakdown,
    listing_tip: raw.listing_tip,
  };
});

/** Force listing grade for seller-declared new inventory. */
export function conditionGradeForWearState(
  wearState: MarketWearState,
  analysis: ConditionAnalysis
): ConditionAnalysis['grade'] {
  if (wearState === 'bnib' || wearState === 'new_no_box') return 'new';
  return analysis.grade;
}

export const PriceCompSchema = z.object({
  source: z.enum(['guild', 'guild_asking', 'ebay', 'catalog']),
  price_cents: z.number(),
  label: z.string(),
  date: z.string().optional(),
  size_us: z.number().optional(),
  colorway: z.string().optional(),
  condition: z.string().optional(),
  wear_state: z.string().optional(),
  notes: z.string().optional(),
});

export type PriceComp = z.infer<typeof PriceCompSchema>;

export const PriceAnalysisSchema = z.object({
  suggested_low_cents: z.number(),
  suggested_mid_cents: z.number(),
  suggested_high_cents: z.number(),
  confidence: z.enum(['high', 'medium', 'low']),
  confidence_note: z.string(),
  comps: z.array(PriceCompSchema),
  market_note: z.string(),
});

export type PriceAnalysis = z.infer<typeof PriceAnalysisSchema>;

export const AgentDraftSchema = z.object({
  title: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  size: z.number().optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']).optional(),
  price_cents: z.number().optional(),
  description: z.string(),
  listing_type: z.enum(['sell', 'trade', 'vault', 'collection']).optional(),
});

export const AgentResponseSchema = z.object({
  has_draft: z.boolean(),
  message: z.string().optional(),
  draft: AgentDraftSchema.optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
