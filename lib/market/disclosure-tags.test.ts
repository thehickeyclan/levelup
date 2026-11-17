import { describe, expect, it } from 'vitest';
import {
  DISCLOSURE_TAGS,
  normalizeDisclosureTags,
  disclosurePricingLines,
  disclosureTagByCode,
} from './disclosure-tags';
import { ConditionAnalysisSchema } from './ai/schemas';

describe('normalizeDisclosureTags', () => {
  it('whitelists, dedupes, and keeps standards order', () => {
    expect(
      normalizeDisclosureTags(['no_box', 'custom_painted', 'no_box', 'REPLICA', 'made_up'])
    ).toEqual(['custom_painted', 'no_box']);
  });

  it('rejects replica — it ships locked to its category, never as a pill', () => {
    expect(normalizeDisclosureTags(['replica'])).toEqual([]);
    expect(disclosureTagByCode('replica')).toBeNull();
  });

  it('returns undefined for non-arrays so PATCH leaves the field untouched', () => {
    expect(normalizeDisclosureTags(undefined)).toBeUndefined();
    expect(normalizeDisclosureTags('sole_swapped')).toBeUndefined();
  });

  it('covers all seven standards §3 tags (REPLICA excluded by design)', () => {
    expect(DISCLOSURE_TAGS.map((t) => t.code)).toEqual([
      'sole_swapped',
      'repaired',
      'custom_painted',
      'custom_build',
      'mismatched_pair',
      'display_only',
      'no_box',
    ]);
  });
});

describe('disclosurePricingLines', () => {
  it('is silent for clean pairs', () => {
    expect(disclosurePricingLines([])).toEqual([]);
    expect(disclosurePricingLines(null)).toEqual([]);
  });

  it('names the disclosed work for the pricing AI', () => {
    const lines = disclosurePricingLines(['custom_painted', 'sole_swapped']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Custom painted');
    expect(lines[0]).toContain('not against stock sold comps');
  });
});

describe('condition analysis suggested_disclosures', () => {
  it('whitelists AI suggestions through the schema transform', () => {
    const parsed = ConditionAnalysisSchema.parse({
      wrestle_score: 7,
      cosmetic_score: 6,
      summary: 'ok',
      suggested_disclosures: ['custom_painted', 'not_a_tag', 'replica'],
    });
    expect(parsed.suggested_disclosures).toEqual(['custom_painted']);
  });

  it('omits the field when nothing valid is suggested', () => {
    const parsed = ConditionAnalysisSchema.parse({
      wrestle_score: 7,
      summary: 'ok',
    });
    expect(parsed.suggested_disclosures).toBeUndefined();
  });
});
