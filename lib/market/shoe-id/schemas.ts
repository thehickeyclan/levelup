import { z } from 'zod';

export const ShoeIdResultSchema = z.object({
  brand: z.string(),
  model: z.string(),
  model_aliases: z.array(z.string()).default([]),
  era: z.string(),
  colorway: z.string(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'grail']),
  confidence: z.number().min(0).max(1),
  confidence_note: z.string(),
  visual_matches: z.array(z.string()),
  value_low_cents: z.number().int(),
  value_mid_cents: z.number().int(),
  value_high_cents: z.number().int(),
  collector_notes: z.string(),
  catalog_matched: z.boolean(),
});

export type ShoeIdResult = z.infer<typeof ShoeIdResultSchema>;

export const CatalogEntrySchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  model_aliases: z.array(z.string()).optional(),
  years_produced: z.string().optional(),
  colorways: z.array(z.unknown()).optional(),
  visual_identifiers: z.array(z.string()).optional(),
  sole_description: z.string().optional(),
  upper_material: z.string().optional(),
  logo_placement: z.string().optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'grail']),
  value_low_cents: z.number().int().optional(),
  value_mid_cents: z.number().int().optional(),
  value_high_cents: z.number().int().optional(),
  collector_notes: z.string().optional(),
  source: z.string().optional(),
  verified: z.boolean().optional(),
  verified_by: z.string().optional(),
});

export type CatalogEntryInput = z.infer<typeof CatalogEntrySchema>;
