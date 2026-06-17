import { z } from 'zod';

export const ConditionBreakdownSchema = z.object({
  sole: z.object({ score: z.number(), note: z.string() }).optional(),
  upper: z.object({ score: z.number(), note: z.string() }).optional(),
  midsole: z.object({ score: z.number(), note: z.string() }).optional(),
  laces: z.object({ score: z.number(), note: z.string() }).optional(),
});

export const ConditionAnalysisSchema = z.object({
  score: z.number().min(1).max(10),
  grade: z.enum(['new', 'like_new', 'good', 'fair']),
  summary: z.string(),
  breakdown: ConditionBreakdownSchema,
  listing_tip: z.string().optional(),
});

export const PriceCompSchema = z.object({
  source: z.enum(['guild', 'ebay']),
  price_cents: z.number(),
  label: z.string(),
  date: z.string().optional(),
});

export const PriceAnalysisSchema = z.object({
  suggested_low_cents: z.number(),
  suggested_mid_cents: z.number(),
  suggested_high_cents: z.number(),
  confidence: z.enum(['high', 'medium', 'low']),
  confidence_note: z.string(),
  comps: z.array(PriceCompSchema),
  market_note: z.string(),
});

export const AgentDraftSchema = z.object({
  title: z.string(),
  brand: z.string(),
  model: z.string(),
  size: z.number(),
  condition: z.enum(['new', 'like_new', 'good', 'fair']),
  price_cents: z.number().optional(),
  description: z.string(),
  listing_type: z.enum(['sell', 'trade', 'vault']).optional(),
});
