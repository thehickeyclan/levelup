import { describe, expect, it } from 'vitest';
import { evaluateRepriceNudge, repriceNudgeCopy } from './reprice-nudge';
import type { ValueReference } from './value-reference';
import type { ColorwayProfile } from '@/lib/market/shoe-id/schemas';

const ref = (over: Partial<ValueReference> = {}): ValueReference => ({
  mid_cents: 10000,
  low_cents: null,
  high_cents: null,
  confidence: 'medium',
  source_label: 'From 24 IG resale posts',
  detail_label: 'good-condition eBay median $100 (11 sales)',
  stock_caveat: null,
  ...over,
});

const base = {
  priceCents: 20000, // 2× the $100 reference
  reference: ref(),
  catalogMatched: true,
  profiles: [] as ColorwayProfile[],
  matchedProfile: null as ColorwayProfile | null,
};

const premiumNoValue: ColorwayProfile = {
  name: 'David Taylor',
  availability: 'limited',
  value_tier: 'rare',
};
const premiumWithValue: ColorwayProfile = {
  name: 'Cherry',
  availability: 'grail',
  value_tier: 'grail',
  value_low_cents: 30000,
  value_mid_cents: 40000,
  value_high_cents: 50000,
};
const commonProfile: ColorwayProfile = {
  name: 'Black/White',
  availability: 'discontinued',
  value_tier: 'common',
};

describe('evaluateRepriceNudge', () => {
  it('fires on a 2× ask with a clean reference and no premium colorways', () => {
    const v = evaluateRepriceNudge(base);
    expect(v.fire).toBe(true);
    if (v.fire) expect(v.ratio).toBe(2);
  });

  it('stays silent within 1.5× of the reference', () => {
    expect(evaluateRepriceNudge({ ...base, priceCents: 15000 }).fire).toBe(false);
  });

  it('never fires on a low-confidence reference', () => {
    const v = evaluateRepriceNudge({
      ...base,
      reference: ref({ confidence: 'low' }),
    });
    expect(v).toEqual({ fire: false, reason: 'low-confidence reference' });
  });

  it('never fires on a misfiled listing — that is a filing fix', () => {
    const v = evaluateRepriceNudge({ ...base, catalogMatched: false });
    expect(v).toEqual({ fire: false, reason: 'not filed to a catalog model' });
  });

  it('never fires on a modified pair', () => {
    const v = evaluateRepriceNudge({
      ...base,
      reference: ref({ stock_caveat: 'Stock-pair reference — custom painted.' }),
    });
    expect(v.fire).toBe(false);
  });

  it('spares an unprofiled colorway on a model with premium colorways', () => {
    // The first nudges must not land on sellers holding rare colorways.
    const v = evaluateRepriceNudge({
      ...base,
      profiles: [premiumNoValue, commonProfile],
      matchedProfile: null,
    });
    expect(v.fire).toBe(false);
    if (!v.fire) expect(v.reason).toContain('premium colorways');
  });

  it('spares a premium colorway without a curated value', () => {
    const v = evaluateRepriceNudge({
      ...base,
      profiles: [premiumNoValue],
      matchedProfile: premiumNoValue,
    });
    expect(v).toEqual({ fire: false, reason: 'premium colorway without a curated value' });
  });

  it('fires on a premium colorway whose curated value the ask still exceeds', () => {
    // Reference mid here is already the curated colorway value — a 2× ask
    // over THAT is genuinely high.
    const v = evaluateRepriceNudge({
      ...base,
      priceCents: 80000,
      reference: ref({ mid_cents: 40000 }),
      profiles: [premiumWithValue],
      matchedProfile: premiumWithValue,
    });
    expect(v.fire).toBe(true);
  });

  it('fires on a common-tier colorway even when the model has premium ones', () => {
    const v = evaluateRepriceNudge({
      ...base,
      profiles: [premiumNoValue, commonProfile],
      matchedProfile: commonProfile,
    });
    expect(v.fire).toBe(true);
  });
});

describe('repriceNudgeCopy', () => {
  it('cites eBay sold for price and IG for volume, never a scolding', () => {
    const v = evaluateRepriceNudge(base);
    if (!v.fire) throw new Error('expected fire');
    const copy = repriceNudgeCopy('Adidas Combat Speed 4', 20000, v);
    expect(copy.body).toContain('$200 ask');
    expect(copy.body).toContain('2.0×');
    expect(copy.body).toContain('eBay median $100');
    expect(copy.body).toContain('IG resale posts');
    expect(copy.body).not.toMatch(/overpriced|too high|unrealistic/i);
  });
});
