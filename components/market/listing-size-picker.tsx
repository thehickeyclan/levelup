'use client';

import type { ListingSizeRow } from '@/lib/market/listing-sizes';
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
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-foreground">Select size (US)</p>
      <div className="flex flex-wrap gap-2">
        {available.map((row) => (
          <button
            key={row.size_us}
            type="button"
            onClick={() => onChange(row.size_us)}
            className={cn(
              'min-h-10 min-w-[3rem] rounded-full border px-3 text-sm font-medium transition-colors touch-manipulation',
              value === row.size_us
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-foreground hover:border-accent/40'
            )}
          >
            {row.size_us}
            {row.quantity > 1 ? (
              <span className="text-[10px] text-muted-foreground ml-1">×{row.quantity}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
