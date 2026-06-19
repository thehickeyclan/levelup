import { cn } from '@/lib/utils';
import { rarityBadgeClass, rarityLabel, type MarketRarity } from '@/lib/market/rarity';

export function RarityBadge({
  rarity,
  size = 'sm',
  className,
}: {
  rarity: MarketRarity;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium capitalize',
        size === 'sm' ? 'text-[9px] px-2 py-0.5 tracking-wide' : 'text-xs px-2.5 py-1',
        rarityBadgeClass(rarity),
        className
      )}
    >
      {rarityLabel(rarity)}
    </span>
  );
}
