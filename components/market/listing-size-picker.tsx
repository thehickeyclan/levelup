'use client';

import type { ListingSizeRow } from '@/lib/market/listing-sizes';
import { formatMarketShoeSizeDual, formatShoeSizeOptionLabel } from '@/lib/market/listing-sizes';
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
      <label className="text-sm text-muted-foreground" htmlFor="listing-size-select">
        Select size
      </label>
      <select
        id="listing-size-select"
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm h-11"
        value={value ?? ''}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      >
        <option value="" disabled>
          Choose men&apos;s / women&apos;s size
        </option>
        {available.map((row) => (
          <option key={row.size_us} value={row.size_us}>
            {formatShoeSizeOptionLabel(row.size_us)}
            {row.quantity > 1 ? ` · ${row.quantity} in stock` : ''}
          </option>
        ))}
      </select>
      {value != null ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Selected: {formatMarketShoeSizeDual(value)} (men&apos;s / women&apos;s US)
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-snug">
          Men&apos;s and women&apos;s US sizes — standard +1.5 conversion.
        </p>
      )}
    </div>
  );
}
