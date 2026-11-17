import { describe, expect, it } from 'vitest';
import { getConditionTiers, conditionTierPromptLines } from './condition-tiers';

describe('condition tiers', () => {
  it('finds the inverted Combat Speed 4 market and warns', () => {
    const t = getConditionTiers('Adidas', 'Combat Speed 4');
    expect(t).not.toBeNull();
    // The signature inversion: new sells BELOW good because the used pool
    // carries the rare colorways.
    expect(t!.tiers.new!.median_usd).toBeLessThan(t!.tiers.good!.median_usd);
    const lines = conditionTierPromptLines(t);
    expect(lines.join(' ')).toContain('CONDITION WARNING');
  });

  it('resolves alias spellings to the canonical row', () => {
    const t = getConditionTiers('Adidas', 'Combat Speed IV');
    expect(t?.model).toBe('Combat Speed 4');
  });

  it('is silent for unknown models', () => {
    expect(getConditionTiers('Nike', 'Not A Shoe')).toBeNull();
    expect(conditionTierPromptLines(null)).toEqual([]);
  });
});
