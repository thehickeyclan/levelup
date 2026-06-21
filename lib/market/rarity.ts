export const MARKET_RARITIES = ['common', 'uncommon', 'rare', 'grail'] as const;

export type MarketRarity = (typeof MARKET_RARITIES)[number];

export function normalizeMarketRarity(value: string | null | undefined): MarketRarity | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return MARKET_RARITIES.includes(v as MarketRarity) ? (v as MarketRarity) : null;
}

export function rarityLabel(rarity: MarketRarity): string {
  switch (rarity) {
    case 'common':
      return 'Common';
    case 'uncommon':
      return 'Uncommon';
    case 'rare':
      return 'Rare';
    case 'grail':
      return 'Grail';
  }
}

export function rarityShortHint(rarity: MarketRarity): string {
  switch (rarity) {
    case 'common':
      return 'Easy to find — current or widely produced';
    case 'uncommon':
      return 'Harder to find — limited runs or older stock';
    case 'rare':
      return 'Collector interest — discontinued or scarce colorway';
    case 'grail':
      return 'Highly sought — grail-tier pair for wrestlers';
  }
}

export function rarityBadgeClass(rarity: MarketRarity): string {
  switch (rarity) {
    case 'common':
      return 'bg-muted/80 text-muted-foreground border-border';
    case 'uncommon':
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    case 'rare':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/40';
    case 'grail':
      return 'bg-accent/20 text-accent border-accent/50';
  }
}

/** Higher = more rare. Unknown/null = 0. */
export function rarityRank(rarity: MarketRarity | null | undefined): number {
  switch (rarity) {
    case 'grail':
      return 4;
    case 'rare':
      return 3;
    case 'uncommon':
      return 2;
    case 'common':
      return 1;
    default:
      return 0;
  }
}
