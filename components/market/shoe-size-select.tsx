'use client';

import {
  MARKET_MENS_SHOE_SIZES,
  formatShoeSizeOptionLabel,
  menSizeFromFormValue,
} from '@/lib/market/listing-sizes';
import { cn } from '@/lib/utils';

export function ShoeSizeSelect({
  value,
  onChange,
  disabled,
  excludeSizes,
  className,
  placeholder = 'Select size',
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (menSize: string) => void;
  disabled?: boolean;
  excludeSizes?: number[];
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const normalized = menSizeFromFormValue(value) || value.trim();

  return (
    <select
      className={cn(
        'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm h-11',
        className
      )}
      value={normalized}
      disabled={disabled}
      aria-label={ariaLabel ?? 'Shoe size'}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {MARKET_MENS_SHOE_SIZES.map((men) => {
        const menStr = String(men);
        const taken = excludeSizes?.some((s) => s === men) && menStr !== normalized;
        return (
          <option key={men} value={menStr} disabled={taken}>
            {formatShoeSizeOptionLabel(men)}
          </option>
        );
      })}
    </select>
  );
}
