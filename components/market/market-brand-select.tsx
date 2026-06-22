'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MARKET_BRANDS } from '@/lib/market/brands';

type MarketBrandSelectProps = {
  value: string;
  onChange: (brand: string) => void;
  brands?: string[];
  isAdmin?: boolean;
  className?: string;
  onBrandAdded?: (brand: string, brands: string[]) => void;
};

export function MarketBrandSelect({
  value,
  onChange,
  brands,
  isAdmin = false,
  className,
  onBrandAdded,
}: MarketBrandSelectProps) {
  const options = brands?.length ? brands : [...MARKET_BRANDS];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addBrand = async () => {
    const trimmed = newBrand.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/admin/market/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add brand');
      const added = data.brand?.name as string;
      const sellerBrands = (data.sellerBrands as string[]) ?? options;
      if (added) onChange(added);
      onBrandAdded?.(added, sellerBrands);
      setNewBrand('');
      setDialogOpen(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add brand');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-1">
      <select
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      {isAdmin ? (
        <>
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add brand (admin)
          </button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Add market brand</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  Adds to the dropdown for everyone. Regular sellers still cannot create brands themselves.
                </p>
                <div>
                  <Label htmlFor="new-market-brand">Brand name</Label>
                  <Input
                    id="new-market-brand"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value.slice(0, 40))}
                    placeholder="e.g. Matflex"
                    className="mt-1"
                  />
                </div>
                {addError ? <p className="text-xs text-destructive">{addError}</p> : null}
                <Button
                  type="button"
                  className="w-full bg-accent text-accent-foreground"
                  disabled={!newBrand.trim() || adding}
                  onClick={() => void addBrand()}
                >
                  {adding ? 'Adding…' : 'Add brand'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
