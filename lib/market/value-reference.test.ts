import { describe, expect, it } from 'vitest';
import { assembleValueReference } from './value-reference';
import { getConditionTiers } from './condition-tiers';
import { getIgPriceHistory } from './ig-price-history';

const base = {
  marketValue: null,
  guildSales: 0,
  documentedSales: 0,
  ig: null,
  tiers: null,
} as const;

describe('assembleValueReference', () => {
  it('shows nothing under 3 combined sales — no invented numbers', () => {
    expect(assembleValueReference({ ...base, documentedSales: 2 })).toBeNull();
    expect(
      assembleValueReference({ ...base, guildSales: 1, documentedSales: 1 })
    ).toBeNull();
  });

  it('prefers the computed market value when present', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 20000, mid_cents: 27500, high_cents: 35000, confidence: 'medium' },
      guildSales: 1,
      documentedSales: 3,
    });
    expect(ref).toMatchObject({ mid_cents: 27500, low_cents: 20000, confidence: 'medium' });
    expect(ref!.source_label).toBe('From 1 Guild sale · 3 documented sales');
  });

  it('falls back to the matching condition tier with real data', () => {
    const tiers = getConditionTiers('Adidas', 'Combat Speed 4');
    const ref = assembleValueReference({
      ...base,
      documentedSales: 11,
      tiers,
      wearState: 'used',
      condition: 'good',
    });
    // CS4 good-tier median is $250 (11 sales) in the committed index.
    expect(ref!.mid_cents).toBe(25000);
    expect(ref!.detail_label).toContain('good-condition eBay median $250');
  });

  it('falls back to the IG ledger when nothing else qualifies', () => {
    const ig = getIgPriceHistory('Asics', 'Rulon');
    const ref = assembleValueReference({ ...base, ig });
    expect(ref).not.toBeNull();
    expect(ref!.confidence).toBe('low');
    expect(ref!.source_label).toContain('IG resale post');
  });

  it('marks the reference as stock-pair on modified listings', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 8000, mid_cents: 9000, high_cents: 11000, confidence: 'low' },
      documentedSales: 3,
      disclosureTags: ['sole_swapped', 'no_box'],
    });
    expect(ref!.stock_caveat).toContain('sole swapped');
    expect(ref!.stock_caveat).not.toContain('no box');
  });
});
