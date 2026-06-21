'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type SizeInventoryRow = {
  size_us: string;
  quantity: string;
};

export function emptySizeInventoryRow(sizeUs = '10'): SizeInventoryRow {
  return { size_us: sizeUs, quantity: '1' };
}

export function BnibSizeInventoryEditor({
  rows,
  onChange,
  disabled,
  className,
}: {
  rows: SizeInventoryRow[];
  onChange: (rows: SizeInventoryRow[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const updateRow = (index: number, patch: Partial<SizeInventoryRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => onChange([...rows, emptySizeInventoryRow()]);

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-xs">Sizes in stock</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            One product page, shared photos. Add every BNIB size you have — buyers pick size at checkout.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add size
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_72px_auto] gap-2 items-center">
            <Input
              className="h-11"
              value={row.size_us}
              disabled={disabled}
              onChange={(e) => updateRow(index, { size_us: e.target.value })}
              placeholder="10"
              inputMode="decimal"
              aria-label={`US size row ${index + 1}`}
            />
            <Input
              className="h-11"
              value={row.quantity}
              disabled={disabled}
              onChange={(e) =>
                updateRow(index, { quantity: e.target.value.replace(/\D/g, '').slice(0, 2) })
              }
              placeholder="Qty"
              inputMode="numeric"
              aria-label={`Quantity row ${index + 1}`}
            />
            <button
              type="button"
              disabled={disabled || rows.length <= 1}
              onClick={() => removeRow(index)}
              className="h-11 w-11 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-40"
              aria-label="Remove size"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_72px_auto] gap-2 text-[10px] text-muted-foreground px-0.5">
        <span>US size</span>
        <span>Qty</span>
        <span className="w-11" />
      </div>
    </div>
  );
}

export function UsedListingSizeNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-muted-foreground leading-snug', className)}>
      Used pairs are listed individually — upload photos of this exact shoe. For multiple BNIB sizes,
      switch to BNIB above and manage all sizes on one listing.
    </p>
  );
}
