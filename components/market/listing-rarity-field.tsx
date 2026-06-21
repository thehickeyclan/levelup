'use client';

import {
  MARKET_RARITIES,
  rarityLabel,
  rarityShortHint,
  type MarketRarity,
} from '@/lib/market/rarity';
import { RarityBadge } from '@/components/market/rarity-badge';
import { Label } from '@/components/ui/label';

export function ListingRarityField({
  rarity,
  isAdmin,
  assessing,
  onChange,
}: {
  rarity: MarketRarity | '';
  isAdmin: boolean;
  assessing?: boolean;
  onChange: (rarity: MarketRarity | '') => void;
}) {
  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Rarity</Label>
        {rarity ? (
          <div className="flex flex-wrap items-center gap-2">
            <RarityBadge rarity={rarity} size="sm" />
            <span className="text-xs text-muted-foreground">{rarityShortHint(rarity)}</span>
          </div>
        ) : assessing ? (
          <p className="text-xs text-muted-foreground">AI assessing rarity…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            AI sets rarity from photos, catalog, and model — no manual input needed.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Rarity</Label>
        {rarity ? <RarityBadge rarity={rarity} size="sm" /> : null}
      </div>
      <p className="text-[10px] text-muted-foreground">Admin override — default is AI on save.</p>
      <select
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm h-11"
        value={rarity}
        onChange={(e) => onChange((e.target.value as MarketRarity | '') || '')}
      >
        <option value="">Let AI decide</option>
        {MARKET_RARITIES.map((r) => (
          <option key={r} value={r}>{rarityLabel(r)}</option>
        ))}
      </select>
      {rarity ? (
        <p className="text-xs text-muted-foreground">{rarityShortHint(rarity)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Leave on AI decide to reassess from catalog and photos on save.
        </p>
      )}
    </div>
  );
}
