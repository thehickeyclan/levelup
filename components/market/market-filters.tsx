'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Tag, Ruler, Star, DollarSign, ChevronDown, Check, X, Palette } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BROWSE_BRANDS, BROWSE_US_SIZES } from '@/lib/market/browse-listings';
import { BROWSE_COLOR_FAMILIES } from '@/lib/market/color-family';
import {
  BROWSE_CONDITION_OPTIONS,
  type BrowseConditionFilter,
} from '@/lib/market/wear-state';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'buy', label: 'For Sale' },
  { id: 'trade', label: 'Trade' },
  { id: 'vault', label: 'Offers' },
  { id: 'collectors', label: 'Collection' },
] as const;

const BRAND_OPTIONS = (browseBrands?: string[]) => {
  const brands = browseBrands?.length ? browseBrands : [...BROWSE_BRANDS];
  return ['All', ...brands, 'Other'] as const;
};

const PRICE_OPTIONS = [
  { id: 'all', label: 'All', min: undefined as number | undefined, max: undefined as number | undefined },
  { id: 'under50', label: 'Under $50', min: undefined, max: 50 },
  { id: '50-100', label: '$50–$100', min: 50, max: 100 },
  { id: '100-200', label: '$100–$200', min: 100, max: 200 },
  { id: '200plus', label: '$200+', min: 200, max: undefined },
] as const;

type TypeFilter = (typeof TYPE_OPTIONS)[number]['id'];

function formatSizeLabel(size: string): string {
  const n = Number(size);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function activePriceOption(minPrice: string, maxPrice: string) {
  const min = minPrice ? Number(minPrice) : undefined;
  const max = maxPrice ? Number(maxPrice) : undefined;
  return (
    PRICE_OPTIONS.find(
      (o) =>
        o.id !== 'all' &&
        o.min === min &&
        o.max === max
    ) ?? (minPrice || maxPrice ? null : PRICE_OPTIONS[0])
  );
}

function priceChipLabel(minPrice: string, maxPrice: string): string {
  const opt = activePriceOption(minPrice, maxPrice);
  if (opt && opt.id !== 'all') return opt.label;
  if (minPrice && maxPrice) return `$${minPrice}–$${maxPrice}`;
  if (maxPrice) return `Under $${maxPrice}`;
  if (minPrice) return `$${minPrice}+`;
  return 'Price';
}

type FilterOption = { id: string; label: string };

function FilterDropdown({
  icon,
  label,
  value,
  options,
  onSelect,
  active,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  options: FilterOption[];
  onSelect: (id: string) => void;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'bg-card border rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors',
          active
            ? 'border-accent text-accent'
            : 'border-border text-muted-foreground'
        )}
      >
        <span className={active ? 'text-accent' : 'text-muted-foreground'}>{icon}</span>
        <span>{label}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0', open && 'rotate-180 transition-transform')} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-border bg-card py-1 shadow-lg">
          {options.map((opt) => {
            const selected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted',
                  selected ? 'text-accent' : 'text-muted-foreground'
                )}
              >
                <span className="w-3.5 shrink-0">
                  {selected ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export type MarketFiltersProps = {
  type: TypeFilter;
  brand: string;
  color: string;
  size: string;
  condition: BrowseConditionFilter;
  minPrice: string;
  maxPrice: string;
  browseBrands?: string[];
  setParam: (key: string, value: string) => void;
  setPriceRange: (min?: number, max?: number) => void;
  clearAllFilters: () => void;
};

export function MarketFilters({
  type,
  brand,
  color,
  size,
  condition,
  minPrice,
  maxPrice,
  browseBrands,
  setParam,
  setPriceRange,
  clearAllFilters,
}: MarketFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const typePillClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
      active ? 'bg-accent text-accent-foreground' : 'border border-border text-muted-foreground'
    );

  const brandOptions: FilterOption[] = BRAND_OPTIONS(browseBrands).map((b) => ({
    id: b === 'All' ? 'all' : b,
    label: b,
  }));

  const sizeOptions: FilterOption[] = [
    { id: '', label: 'All' },
    ...BROWSE_US_SIZES.map((s) => ({
      id: String(s),
      label: `Size ${formatSizeLabel(String(s))}`,
    })),
  ];

  const conditionOptions: FilterOption[] = BROWSE_CONDITION_OPTIONS.map((o) => ({
    id: o.id,
    label: o.label,
  }));

  const priceOptions: FilterOption[] = PRICE_OPTIONS.map((o) => ({
    id: o.id,
    label: o.label,
  }));

  const activePrice = activePriceOption(minPrice, maxPrice);
  const priceValue = activePrice?.id ?? (minPrice || maxPrice ? 'custom' : 'all');

  const brandLabel = brand !== 'all' ? brand : 'Brand';
  const colorLabel =
    color !== 'all'
      ? (BROWSE_COLOR_FAMILIES.find((c) => c.id === color)?.label ?? 'Color')
      : 'Color';
  const sizeLabel = size ? `Size ${formatSizeLabel(size)}` : 'Size';
  const conditionLabel =
    condition !== 'all'
      ? (BROWSE_CONDITION_OPTIONS.find((o) => o.id === condition)?.label ?? 'Condition')
      : 'Condition';
  const priceLabel =
    activePrice && activePrice.id !== 'all' ? activePrice.label : '$ Price';

  const hasActiveFilters =
    brand !== 'all' ||
    color !== 'all' ||
    Boolean(size) ||
    condition !== 'all' ||
    Boolean(minPrice || maxPrice);

  const colorOptions: FilterOption[] = [
    { id: 'all', label: 'All' },
    ...BROWSE_COLOR_FAMILIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  const handlePriceSelect = useCallback(
    (id: string) => {
      const opt = PRICE_OPTIONS.find((o) => o.id === id);
      if (!opt || id === 'all') {
        setPriceRange();
        return;
      }
      setPriceRange(opt.min, opt.max);
    },
    [setPriceRange]
  );

  const brandDropdown = (
    <FilterDropdown
      icon={<Tag className="h-3 w-3" />}
      label={brandLabel}
      value={brand}
      options={brandOptions}
      onSelect={(id) => setParam('brand', id)}
      active={brand !== 'all'}
    />
  );

  const colorDropdown = (
    <FilterDropdown
      icon={<Palette className="h-3 w-3" />}
      label={colorLabel}
      value={color}
      options={colorOptions}
      onSelect={(id) => setParam('color', id)}
      active={color !== 'all'}
    />
  );

  const sizeDropdown = (
    <FilterDropdown
      icon={<Ruler className="h-3 w-3" />}
      label={sizeLabel}
      value={size}
      options={sizeOptions}
      onSelect={(id) => setParam('size', id)}
      active={Boolean(size)}
    />
  );

  const conditionDropdown = (
    <FilterDropdown
      icon={<Star className="h-3 w-3" />}
      label={conditionLabel}
      value={condition}
      options={conditionOptions}
      onSelect={(id) => setParam('condition', id)}
      active={condition !== 'all'}
    />
  );

  const priceDropdown = (
    <FilterDropdown
      icon={<DollarSign className="h-3 w-3" />}
      label={priceLabel}
      value={priceValue}
      options={priceOptions}
      onSelect={handlePriceSelect}
      active={Boolean(minPrice || maxPrice)}
    />
  );

  const allDropdowns = (
    <>
      {brandDropdown}
      {colorDropdown}
      {sizeDropdown}
      {conditionDropdown}
      {type !== 'collectors' ? priceDropdown : null}
    </>
  );

  return (
    <>
      <div className="sticky top-0 z-40 bg-muted border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('type', opt.id)}
                className={typePillClass(type === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Desktop: all four dropdowns */}
          <div className="hidden sm:flex gap-2 flex-wrap">{allDropdowns}</div>

          {/* Mobile: Brand + Size + More */}
          <div className="flex sm:hidden gap-2 items-center">
            {brandDropdown}
            {sizeDropdown}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                'bg-card border rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0',
                condition !== 'all' || color !== 'all' || minPrice || maxPrice
                  ? 'border-accent text-accent'
                  : 'border-border text-muted-foreground'
              )}
            >
              More
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="flex gap-2 flex-wrap items-center px-4 py-2 border-t border-border max-w-4xl mx-auto">
            {brand !== 'all' ? (
              <button
                type="button"
                onClick={() => setParam('brand', 'all')}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] text-accent"
              >
                {brand}
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
            {color !== 'all' ? (
              <button
                type="button"
                onClick={() => setParam('color', 'all')}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] text-accent"
              >
                {colorLabel}
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
            {size ? (
              <button
                type="button"
                onClick={() => setParam('size', '')}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] text-accent"
              >
                Sz {formatSizeLabel(size)}
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
            {condition !== 'all' ? (
              <button
                type="button"
                onClick={() => setParam('condition', 'all')}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] text-accent"
              >
                {BROWSE_CONDITION_OPTIONS.find((o) => o.id === condition)?.label}
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
            {type !== 'collectors' && (minPrice || maxPrice) ? (
              <button
                type="button"
                onClick={() => setPriceRange()}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] text-accent"
              >
                {priceChipLabel(minPrice, maxPrice)}
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[10px] text-muted-foreground hover:text-muted-foreground"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="fixed bottom-0 left-0 right-0 top-auto z-50 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-border bg-muted p-4 pb-8 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom">
          <DialogHeader>
            <DialogTitle className="text-sm text-foreground">Filters</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-5">
            <FilterSection title="Brand">{brandDropdown}</FilterSection>
            <FilterSection title="Color">{colorDropdown}</FilterSection>
            <FilterSection title="Size">{sizeDropdown}</FilterSection>
            <FilterSection title="Condition">{conditionDropdown}</FilterSection>
            {type !== 'collectors' ? <FilterSection title="Price">{priceDropdown}</FilterSection> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
