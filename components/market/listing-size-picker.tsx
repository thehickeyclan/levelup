'use client';

import type { ListingSizeRow } from '@/lib/market/listing-sizes';
import {
  formatMarketShoeSizeDual,
  formatMarketShoeSizeDualLabel,
} from '@/lib/market/listing-sizes';
import { cn } from '@/lib/utils';

export function ListingSizePicker({
  sizes,
  value,
  onChange,
  className,
}: {
  sizes: ListingSizeRow[];
  value: number | null;
  onChange: (size: number) => void;
  className?: string;
}) {
  const available = sizes.filter((row) => row.quantity > 0);
  if (!available.length) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No sizes currently in stock.
      </p>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm text-muted-foreground">{formatMarketShoeSizeDualLabel(value)}</p>
      <div className="grid grid-cols-3 gap-2">
        {available.map((row) => {
          const selected = value === row.size_us;
          return (
            <button
              key={row.size_us}
              type="button"
              onClick={() => onChange(row.size_us)}
              className={cn(
                'min-h-11 rounded-md border px-2 py-2 text-xs font-medium text-center leading-tight transition-colors touch-manipulation',
                selected
                  ? 'border-foreground border-2 bg-background text-foreground'
                  : 'border-border text-foreground hover:border-foreground/40'
              )}
            >
              {formatMarketShoeSizeDual(row.size_us)}
              {row.quantity > 1 ? (
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  ×{row.quantity}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Men&apos;s / women&apos;s US sizes — same shoe, standard +1.5 conversion.
      </p>
    </div>
  );
}
