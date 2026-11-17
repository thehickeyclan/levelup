/**
 * Per-condition eBay sold tiers per catalog model (Muse price-index v2).
 * Build artifact of scripts/build-condition-tiers.ts.
 *
 * The INVERTED flag matters most: on seven models the used pool carries the
 * rarer colorways (e.g. Combat Speed 4: new median $83, good median $250),
 * so a flat new-in-box premium prices them exactly backwards.
 */
import tierData from './data/ebay-condition-tiers.json';

type Tier = { n: number; median_usd: number };
export type ModelConditionTiers = {
  brand: string;
  model: string;
  tiers: Partial<Record<'new' | 'like_new' | 'good' | 'worn', Tier>>;
  bnib_premium_vs_good?: number;
  condition_flag?: string;
};

const data = tierData as unknown as {
  models: Record<string, ModelConditionTiers>;
  alias_keys: Record<string, string>;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function getConditionTiers(
  brand: string | null | undefined,
  model: string | null | undefined
): ModelConditionTiers | null {
  const key = `${norm(brand)}|${norm(model)}`;
  return data.models[key] ?? data.models[data.alias_keys[key]] ?? null;
}

const TIER_LABEL: Record<string, string> = {
  new: 'new',
  like_new: 'like new',
  good: 'good',
  worn: 'worn',
};

/** Prompt lines for the pricing AI; empty when we hold no tier data. */
export function conditionTierPromptLines(t: ModelConditionTiers | null): string[] {
  if (!t) return [];
  const parts = (Object.entries(t.tiers) as [string, Tier][]).map(
    ([tier, v]) => `${TIER_LABEL[tier] ?? tier} $${v.median_usd} (${v.n} sale${v.n !== 1 ? 's' : ''})`
  );
  const lines: string[] = [];
  if (parts.length) {
    lines.push(`eBay sold medians by condition for this model: ${parts.join(', ')}.`);
  }
  if (t.condition_flag) {
    lines.push(
      `CONDITION WARNING — ${t.condition_flag}. Price from the tier matching this listing's actual condition and colorway, not from a new-vs-used rule of thumb.`
    );
  } else if (t.bnib_premium_vs_good != null) {
    lines.push(`Observed new-in-box premium vs good condition: ${t.bnib_premium_vs_good}×.`);
  }
  return lines;
}
