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

  it('uses the computed market value when no condition tier matches', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 20000, mid_cents: 27500, high_cents: 35000, confidence: 'medium' },
      guildSales: 1,
      documentedSales: 3,
    });
    expect(ref).toMatchObject({ mid_cents: 27500, low_cents: 20000, confidence: 'medium' });
    expect(ref!.source_label).toBe('From 1 Guild sale · 3 documented sales');
  });

  it('condition-matched tier beats the pooled market value', () => {
    // A pooled range beside a specific-condition pair anchors buyers wrong —
    // the tier median for the listing's own condition wins (Muse, 17 Nov).
    const tiers = getConditionTiers('Adidas', 'Combat Speed 4');
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 6000, mid_cents: 10500, high_cents: 18000, confidence: 'medium' },
      documentedSales: 11,
      tiers,
      wearState: 'used',
      condition: 'good',
    });
    // CS4 good-tier median is $250 (11 sales) in the committed index.
    expect(ref!.mid_cents).toBe(25000);
    expect(ref!.low_cents).toBeNull();
    expect(ref!.high_cents).toBeNull();
    expect(ref!.detail_label).toContain('good-condition eBay median $250');
  });

  it('matches the new tier for a BNIB pair, not the pooled figure', () => {
    const tiers = getConditionTiers('Adidas', 'Combat Speed 4');
    const ref = assembleValueReference({
      ...base,
      documentedSales: 4,
      tiers,
      wearState: 'bnib',
    });
    // CS4 new-tier median is $83 (4 sales) — the INVERTED model's used pool
    // carries the rare colorways, and BNIB must not inherit their prices.
    expect(ref!.mid_cents).toBe(8300);
    expect(ref!.detail_label).toContain('new-condition eBay median $83');
  });

  it('falls back to an IG point reference — no range the data cannot support', () => {
    const ig = getIgPriceHistory('Asics', 'Rulon');
    const ref = assembleValueReference({ ...base, ig });
    expect(ref).not.toBeNull();
    expect(ref!.confidence).toBe('low');
    expect(ref!.low_cents).toBeNull();
    expect(ref!.high_cents).toBeNull();
    expect(ref!.source_label).toContain('IG resale post');
  });

  it('lets a curated colorway value override pooled model stats', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 5000, mid_cents: 6500, high_cents: 25000, confidence: 'medium' },
      documentedSales: 5,
      colorwayProfile: {
        name: 'Cherry',
        availability: 'grail',
        value_tier: 'grail',
        value_low_cents: 30000,
        value_mid_cents: 40000,
        value_high_cents: 50000,
      },
    });
    // The colorway IS the price on inverted models — curated $400 beats pooled $65.
    expect(ref!.mid_cents).toBe(40000);
    expect(ref!.low_cents).toBe(30000);
    expect(ref!.detail_label).toContain('"Cherry" colorway — grail tier');
  });

  it('labels the colorway tier even without curated values', () => {
    const ref = assembleValueReference({
      ...base,
      marketValue: { low_cents: 5000, mid_cents: 6500, high_cents: 25000, confidence: 'medium' },
      documentedSales: 5,
      colorwayProfile: { name: 'Volt', availability: 'limited', value_tier: 'rare' },
    });
    expect(ref!.mid_cents).toBe(6500); // pooled stats stand
    expect(ref!.detail_label).toContain('"Volt" colorway — rare tier');
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
