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

export const ColorwayAvailabilitySchema = z.enum([
  'current_retail',
  'discontinued',
  'limited',
  'grail',
  'unknown',
]);

export const ColorwayValueTierSchema = z.enum(['common', 'uncommon', 'rare', 'grail']);

export const ColorwayProfileSchema = z.object({
  name: z.string().min(1),
  availability: ColorwayAvailabilitySchema.default('unknown'),
  value_tier: ColorwayValueTierSchema.optional(),
  retail_anchor_cents: z.number().int().positive().optional(),
  value_low_cents: z.number().int().optional(),
  value_mid_cents: z.number().int().optional(),
  value_high_cents: z.number().int().optional(),
  notes: z.string().optional(),
});

export type ColorwayProfile = z.infer<typeof ColorwayProfileSchema>;

export const SaleCompSchema = z.object({
  sold_price_cents: z.number().int().positive(),
  condition: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  colorway: z.string().optional(),
  size_us: z.number().positive().optional(),
  image_urls: z.array(z.string().url()).max(6).optional(),
});

export type SaleComp = z.infer<typeof SaleCompSchema>;

export const CatalogEntrySchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  model_aliases: z.array(z.string()).optional(),
  years_produced: z.string().optional(),
  colorways: z.array(z.unknown()).optional(),
  colorway_profiles: z.array(ColorwayProfileSchema).max(40).optional(),
  visual_identifiers: z.array(z.string()).optional(),
  sole_description: z.string().optional(),
  upper_material: z.string().optional(),
  logo_placement: z.string().optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'grail']),
  value_low_cents: z.number().int().optional(),
  value_mid_cents: z.number().int().optional(),
  value_high_cents: z.number().int().optional(),
  collector_notes: z.string().optional(),
  original_msrp_cents: z.number().int().positive().optional(),
  catalog_price_cents: z.number().int().positive().optional(),
  price_source: z.string().optional(),
  inflation_adjusted_price: z.string().optional(),
  reference_image_urls: z.array(z.string().url()).max(6).optional(),
  sale_comps: z.array(SaleCompSchema).max(20).optional(),
  source: z.string().optional(),
  verified: z.boolean().optional(),
  verified_by: z.string().optional(),
});

export type CatalogEntryInput = z.infer<typeof CatalogEntrySchema>;
