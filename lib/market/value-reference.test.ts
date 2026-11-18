import { describe, expect, it } from 'vitest';
import { assembleValueAssessment, assembleValueReference } from './value-reference';
import { getConditionTiers } from './condition-tiers';
import { getIgPriceHistory } from './ig-price-history';
import type { IgModelHistory } from './ig-price-history';

const base = {
  marketValue: null,
  guildSales: 0,
  documentedSales: 0,
  ig: null,
  tiers: null,
} as const;

const igStub = (over: Partial<IgModelHistory>): IgModelHistory => ({
  brand: 'Test',
  model: 'Model',
  posts: 0,
  priced: 0,
  sold_priced: 0,
  median_usd: null,
  median_recent_24mo_usd: null,
  min_usd: null,
  max_usd: null,
  first_date: null,
  last_date: null,
  latest: [],
  ...over,
});

describe('assembleValueAssessment — the confidence gate (pricing audit 2026-11-18)', () => {
  it('shows nothing at all under 3 combined sales — no invented numbers, no noise', () => {
    expect(assembleValueAssessment({ ...base, documentedSales: 2 })).toEqual({
      reference: null,
      evidence: null,
    });
  });

  it('INVERTED model never prices a BNIB pair from the new tier (CS4 audit card 1)', () => {
    // CS4: new $83 (4), good $250 (11), flagged INVERTED. The platform stamped
    // Matt's $400 Orange/Black BNIB pair at $83 — a third of the used pool.
    const tiers = getConditionTiers('Adidas', 'Combat Speed 4');
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 19,
      ig: getIgPriceHistory('Adidas', 'Combat Speed 4'),
      tiers,
      wearState: 'bnib',
    });
    expect(reference!.mid_cents).toBe(25000);
    expect(reference!.detail_label).toContain('good-condition eBay median $250 (11 sales)');
    expect(reference!.detail_label).toContain('inverted model');
  });

  it('INVERTED + premium colorway notes the colorway sits at or above the reference', () => {
    const tiers = getConditionTiers('Adidas', 'Combat Speed 4');
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 19,
      tiers,
      wearState: 'bnib',
      colorwayProfile: { name: 'David Taylor', availability: 'limited', value_tier: 'rare' },
    });
    expect(reference!.mid_cents).toBe(25000);
    expect(reference!.detail_label).toContain('"David Taylor" colorway — rare tier, sits at or above');
  });

  it('a premium colorway without curated values on an unflagged model shows evidence, not the pooled number (EX-EO audit cards 5/5b)', () => {
    // The EX-EO pool is Successor reissues; a grail-tagged Russian original
    // must never inherit its $254.
    const tiers = getConditionTiers('Asics', 'EX-EO');
    const { reference, evidence } = assembleValueAssessment({
      ...base,
      documentedSales: 9,
      ig: getIgPriceHistory('Asics', 'EX-EO'),
      tiers,
      wearState: 'bnib',
      colorwayProfile: { name: 'Russian Original — Red / Gold / White', availability: 'grail', value_tier: 'grail' },
    });
    expect(reference).toBeNull();
    expect(evidence!.reason).toContain('Russian Original');
    expect(evidence!.lines.join(' ')).toContain('new $253.99 (5)');
  });

  it('never anchors a thin tier when a deeper pool exists (DGU audit card 2)', () => {
    // DGU: new n=2 ($139.99) is too thin; good n=31 ($110) is the market.
    // The old card said ~$50 from three filtered comps.
    const tiers = getConditionTiers('Asics', 'Dan Gable Ultimate');
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 20,
      ig: getIgPriceHistory('Asics', 'Dan Gable Ultimate'),
      tiers,
      wearState: 'new_no_box',
    });
    expect(reference!.mid_cents).toBe(11000);
    expect(reference!.detail_label).toContain('good-condition eBay median $110 (31 sales)');
    expect(reference!.detail_label).toContain('this pair is new');
  });

  it('demotes to evidence when eBay and IG disagree 3×+ (Split Second audit card 3)', () => {
    // Split Second: eBay pool is V/VI/7 reissues at $39.88; the OG market
    // trades on IG at $157–160. A $40 headline beside "IG median $157" lies.
    const tiers = getConditionTiers('Asics', 'Split Second');
    const { reference, evidence } = assembleValueAssessment({
      ...base,
      documentedSales: 19,
      ig: getIgPriceHistory('Asics', 'Split Second'),
      tiers,
      wearState: 'used',
      condition: 'good',
    });
    expect(reference).toBeNull();
    expect(evidence!.reason).toContain('disagree');
    expect(evidence!.lines.join(' ')).toContain('good $39.88 (19)');
    expect(evidence!.lines.join(' ')).toContain('IG sold median $157');
  });

  it('curated variant values price the pair even when the pools cannot (Cronin re-make, audit card 4)', () => {
    // One documented sale is under the combined-sales floor, but the curated
    // band exists precisely because no pool prices a re-make.
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 1,
      colorwayProfile: {
        name: 'Navy / White / Total Orange',
        availability: 'limited',
        value_tier: 'rare',
        value_low_cents: 50000,
        value_high_cents: 75000,
      },
    });
    expect(reference!.mid_cents).toBe(62500);
    expect(reference!.low_cents).toBe(50000);
    expect(reference!.high_cents).toBe(75000);
    expect(reference!.detail_label).toContain('curated collector value');
  });

  it('rejects a thin pooled value — evidence instead of a low-confidence number', () => {
    const { reference, evidence } = assembleValueAssessment({
      ...base,
      marketValue: { low_cents: 4000, mid_cents: 5000, high_cents: 6000, confidence: 'low' },
      documentedSales: 3,
      lastDocumentedSale: { price_cents: 45000, label: 'Magic Man M2, good' },
    });
    expect(reference).toBeNull();
    expect(evidence!.lines.join(' ')).toContain('Last documented sale $450 (Magic Man M2, good)');
  });

  it('IG point reference requires a deep IG pool', () => {
    const thin = assembleValueAssessment({
      ...base,
      ig: igStub({ sold_priced: 5, median_usd: 180 }),
    });
    expect(thin.reference).toBeNull();
    expect(thin.evidence).not.toBeNull();

    const deep = assembleValueAssessment({
      ...base,
      ig: igStub({ sold_priced: 27, median_usd: 228 }),
    });
    expect(deep.reference!.mid_cents).toBe(22800);
    expect(deep.reference!.confidence).toBe('low');
    expect(deep.reference!.low_cents).toBeNull();
    expect(deep.reference!.high_cents).toBeNull();
  });

  it('condition-matched deep tier still anchors a normal model', () => {
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 10,
      tiers: {
        brand: 'Nike',
        model: 'Inflict 4',
        tiers: { new: { n: 8, median_usd: 105 }, good: { n: 6, median_usd: 60 } },
      },
      wearState: 'bnib',
    });
    expect(reference!.mid_cents).toBe(10500);
    expect(reference!.detail_label).toContain('new-condition eBay median $105 (8 sales)');
  });

  it('a new pair of an in-production model references the live manufacturer price', () => {
    // Audit follow-up (Matt, 18 Nov): a BNIB GEN-ONE still sold on Nidrogen's
    // site is worth retail — not "not enough verified sales".
    const { reference } = assembleValueAssessment({
      ...base,
      wearState: 'bnib',
      currentRetail: { cents: 8900, source: 'nidrogen.com' },
    });
    expect(reference!.mid_cents).toBe(8900);
    expect(reference!.confidence).toBe('high');
    expect(reference!.detail_label).toContain('Still at retail — $89 at nidrogen.com');
  });

  it('a used pair of a current model keeps the pool value with retail as the stated ceiling', () => {
    const { reference } = assembleValueAssessment({
      ...base,
      documentedSales: 6,
      tiers: {
        brand: 'Nidrogen',
        model: 'GEN-ONE',
        tiers: { good: { n: 6, median_usd: 55 } },
      },
      wearState: 'used',
      condition: 'good',
      currentRetail: { cents: 8900, source: 'nidrogen.com' },
    });
    expect(reference!.mid_cents).toBe(5500);
    expect(reference!.detail_label).toContain('Still at retail — $89');
  });

  it('a premium colorway of a current model is never capped at retail', () => {
    const { reference, evidence } = assembleValueAssessment({
      ...base,
      documentedSales: 6,
      wearState: 'bnib',
      currentRetail: { cents: 10500, source: 'nike.com' },
      colorwayProfile: { name: 'OE Tokyo', availability: 'limited', value_tier: 'rare' },
    });
    expect(reference).toBeNull();
    expect(evidence!.reason).toContain('OE Tokyo');
    expect(evidence!.lines.join(' ')).toContain('Still at retail');
  });

  it('a matched colorway retail anchor beats the model-level price', () => {
    const { reference } = assembleValueAssessment({
      ...base,
      wearState: 'bnib',
      currentRetail: { cents: 10500, source: 'nike.com' },
      colorwayProfile: {
        name: 'Black / White',
        availability: 'current_retail',
        value_tier: 'common',
        retail_anchor_cents: 9500,
      },
    });
    expect(reference!.mid_cents).toBe(9500);
    expect(reference!.confidence).toBe('high');
  });

  it('carries the stock-pair caveat on both references and evidence', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 8000, mid_cents: 9000, high_cents: 11000, confidence: 'medium' },
      documentedSales: 5,
      disclosureTags: ['sole_swapped', 'no_box'],
    });
    expect(ref!.stock_caveat).toContain('sole swapped');
    expect(ref!.stock_caveat).not.toContain('no box');

    const { evidence } = assembleValueAssessment({
      ...base,
      documentedSales: 3,
      disclosureTags: ['custom_painted'],
    });
    expect(evidence!.stock_caveat).toContain('custom painted');
  });
});
