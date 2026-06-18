'use client';

import { useCallback, useState } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShoeIdResult, SaleComp } from '@/lib/market/shoe-id/schemas';
import { cn } from '@/lib/utils';

const RARITIES = ['common', 'uncommon', 'rare', 'grail'] as const;
const BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance', 'Onitsuka', 'Onitsuka Tiger', 'Other'];
const PRICE_SOURCES = [
  'Eastbay Catalog',
  'Wrestling USA Catalog',
  'ASICS Catalog',
  'Manufacturer website',
  'Retailer launch price',
  'Estimated MSRP',
] as const;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function parseApiJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error('Photo too large for server — use images under 4MB each.');
    }
    throw new Error(text.slice(0, 160) || `Request failed (${res.status})`);
  }
}

type CatalogRow = {
  id: string;
  brand: string;
  model: string;
  years_produced: string | null;
  rarity: string | null;
  original_msrp_cents: number | null;
  value_low_cents: number | null;
  value_mid_cents: number | null;
  value_high_cents: number | null;
  verified: boolean;
  source: string | null;
  reference_image_count: number;
  sale_comp_count: number;
};

type CatalogFullEntry = CatalogRow & {
  model_aliases?: string[] | null;
  colorways?: unknown[] | null;
  visual_identifiers?: string[] | null;
  sole_description?: string | null;
  upper_material?: string | null;
  logo_placement?: string | null;
  weight?: string | null;
  catalog_price_cents?: number | null;
  price_source?: string | null;
  inflation_adjusted_price?: string | null;
  collector_notes?: string | null;
  reference_image_urls?: string[] | null;
  sale_comps?: SaleComp[] | null;
};

type SaleCompForm = {
  sold_price: string;
  size_us: string;
  colorway: string;
  condition: string;
  source: string;
  notes: string;
};

type CatalogFormState = {
  brand: string;
  model: string;
  model_aliases: string;
  years_produced: string;
  visual_identifiers: string;
  sole_description: string;
  upper_material: string;
  logo_placement: string;
  weight: string;
  colorways: string;
  rarity: (typeof RARITIES)[number];
  original_msrp: string;
  catalog_price: string;
  price_source: string;
  inflation_adjusted_price: string;
  value_low: string;
  value_mid: string;
  value_high: string;
  collector_notes: string;
  saleComps: SaleCompForm[];
};

function normalizeRarity(raw: string): (typeof RARITIES)[number] {
  const v = raw.trim().toLowerCase();
  if (v === 'grail') return 'grail';
  if (v === 'rare') return 'rare';
  if (v === 'uncommon') return 'uncommon';
  return 'common';
}

function matchBrand(raw: string): string {
  const trimmed = raw.trim();
  const hit = BRANDS.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return hit ?? trimmed;
}

function parseDollarField(raw: string): string {
  const cleaned = raw.replace(/[~$,]/g, '').trim();
  const num = Number(cleaned);
  if (Number.isNaN(num) || num <= 0) return '';
  return String(num);
}

function dollarsToCents(raw: string): number | undefined {
  const cleaned = raw.replace(/[~$,]/g, '').trim();
  if (!cleaned || Number.isNaN(Number(cleaned))) return undefined;
  const num = Number(cleaned);
  if (num <= 0) return undefined;
  return Math.round(num * 100);
}

function formatAppreciationMultiple(
  msrpCents: number | null | undefined,
  valueMidCents: number | null | undefined
): string | null {
  if (!msrpCents || !valueMidCents) return null;
  return `${(valueMidCents / msrpCents).toFixed(1)}x`;
}

/** Parse GPT-style structured catalog paste (key: value blocks). */
function parseStructuredCatalogPaste(raw: string): Partial<CatalogFormState> | null {
  const fields: Record<string, string[]> = {};
  let currentKey: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (keyMatch) {
      currentKey = keyMatch[1].toLowerCase();
      if (!fields[currentKey]) fields[currentKey] = [];
      const rest = keyMatch[2].trim();
      if (rest) fields[currentKey].push(rest);
    } else if (currentKey && line.trim()) {
      fields[currentKey].push(line.trim());
    }
  }

  if (!fields.brand?.length && !fields.model?.length) return null;

  const joinLines = (key: string) => fields[key]?.join('\n').trim() ?? '';
  const joinList = (key: string, sep: string) =>
    (fields[key] ?? []).map((s) => s.trim()).filter(Boolean).join(sep);

  const visual = joinList('visual_identifiers', '; ');
  const auth = joinList('authentication_points', '; ');
  const visualIdentifiers = [visual, auth ? `Auth: ${auth}` : ''].filter(Boolean).join('; ');

  const years = joinLines('years_produced') || joinLines('release_year');
  const sole = joinLines('sole') || joinLines('sole_description');
  const segments = joinList('market_segments', ', ');
  let collectorNotes = joinLines('collector_notes');
  if (segments) {
    collectorNotes = collectorNotes
      ? `${collectorNotes}\n\nMarket segments: ${segments}`
      : `Market segments: ${segments}`;
  }

  const rarityRaw = joinLines('rarity');
  const msrpRaw =
    joinLines('original_msrp') ||
    joinLines('msrp') ||
    joinLines('launch_price') ||
    joinLines('msrp (launch price)');
  const catalogPriceRaw =
    joinLines('catalog_price') ||
    joinLines('eastbay_sale_price') ||
    joinLines('catalog sale price');
  const priceSource = joinLines('price_source');
  const inflationAdjusted = joinLines('inflation_adjusted_price');
  const weight =
    joinLines('weight') ||
    joinLines('shoe_weight') ||
    joinLines('weight_oz') ||
    joinLines('weight_grams') ||
    joinLines('weight (oz)');

  return {
    brand: fields.brand?.[0] ? matchBrand(fields.brand[0]) : undefined,
    model: fields.model?.[0]?.trim() || undefined,
    years_produced: years || undefined,
    colorways: joinList('colorways', ', ') || undefined,
    visual_identifiers: visualIdentifiers || undefined,
    sole_description: sole || undefined,
    upper_material: joinLines('upper_material') || joinLines('upper') || undefined,
    weight: weight || undefined,
    collector_notes: collectorNotes || undefined,
    rarity: rarityRaw ? normalizeRarity(rarityRaw) : undefined,
    original_msrp: msrpRaw ? parseDollarField(msrpRaw) || undefined : undefined,
    catalog_price: catalogPriceRaw ? parseDollarField(catalogPriceRaw) || undefined : undefined,
    price_source: priceSource || undefined,
    inflation_adjusted_price: inflationAdjusted || undefined,
  };
}

function emptySaleComp(): SaleCompForm {
  return { sold_price: '', size_us: '', colorway: '', condition: '', source: 'Instagram', notes: '' };
}

function emptyForm(): CatalogFormState {
  return {
    brand: 'Adidas',
    model: '',
    model_aliases: '',
    years_produced: '',
    visual_identifiers: '',
    sole_description: '',
    upper_material: '',
    logo_placement: '',
    weight: '',
    colorways: '',
    rarity: 'common',
    original_msrp: '',
    catalog_price: '',
    price_source: '',
    inflation_adjusted_price: '',
    value_low: '',
    value_mid: '',
    value_high: '',
    collector_notes: '',
    saleComps: [emptySaleComp()],
  };
}

function formFromResult(r: ShoeIdResult): CatalogFormState {
  return {
    brand: r.brand,
    model: r.model,
    model_aliases: r.model_aliases.join(', '),
    years_produced: r.era,
    visual_identifiers: r.visual_matches.join('; '),
    sole_description: '',
    upper_material: '',
    logo_placement: '',
    weight: '',
    colorways: r.colorway,
    rarity: r.rarity,
    original_msrp: '',
    catalog_price: '',
    price_source: '',
    inflation_adjusted_price: '',
    value_low: String(Math.round(r.value_low_cents / 100)),
    value_mid: String(Math.round(r.value_mid_cents / 100)),
    value_high: String(Math.round(r.value_high_cents / 100)),
    collector_notes: r.collector_notes,
    saleComps: [emptySaleComp()],
  };
}

function saleCompsFromEntry(comps: SaleComp[] | null | undefined): SaleCompForm[] {
  if (!comps?.length) return [emptySaleComp()];
  return comps.map((c) => ({
    sold_price: String(Math.round(c.sold_price_cents / 100)),
    size_us: c.size_us != null ? String(c.size_us) : '',
    colorway: c.colorway ?? '',
    condition: c.condition ?? '',
    source: c.source ?? '',
    notes: c.notes ?? '',
  }));
}

function parseSizeUs(raw: string): number | undefined {
  const cleaned = raw.trim();
  if (!cleaned || Number.isNaN(Number(cleaned))) return undefined;
  const n = Number(cleaned);
  if (n < 4 || n > 16) return undefined;
  return n;
}

function saleCompsToPayload(comps: SaleCompForm[], linkImageUrls?: string[]): SaleComp[] {
  const result: SaleComp[] = [];
  comps.forEach((c, index) => {
    const price = c.sold_price.trim();
    if (!price || Number.isNaN(Number(price))) return;
    const comp: SaleComp = {
      sold_price_cents: Math.round(Number(price) * 100),
      condition: c.condition.trim() || undefined,
      source: c.source.trim() || undefined,
      notes: c.notes.trim() || undefined,
      colorway: c.colorway.trim() || undefined,
      size_us: parseSizeUs(c.size_us),
    };
    if (index === 0 && linkImageUrls?.length) {
      comp.image_urls = linkImageUrls;
    }
    result.push(comp);
  });
  return result;
}

function formToPayload(form: CatalogFormState, linkImageUrls?: string[]) {
  return {
    brand: form.brand,
    model: form.model.trim(),
    model_aliases: form.model_aliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    years_produced: form.years_produced || undefined,
    visual_identifiers: form.visual_identifiers
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
    sole_description: form.sole_description || undefined,
    upper_material: form.upper_material || undefined,
    logo_placement: form.logo_placement || undefined,
    weight: form.weight.trim() || undefined,
    colorways: form.colorways
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rarity: form.rarity,
    original_msrp_cents: dollarsToCents(form.original_msrp),
    catalog_price_cents: dollarsToCents(form.catalog_price),
    price_source: form.price_source.trim() || undefined,
    inflation_adjusted_price: form.inflation_adjusted_price.trim() || undefined,
    value_low_cents: form.value_low ? Math.round(Number(form.value_low) * 100) : undefined,
    value_mid_cents: form.value_mid ? Math.round(Number(form.value_mid) * 100) : undefined,
    value_high_cents: form.value_high ? Math.round(Number(form.value_high) * 100) : undefined,
    collector_notes: form.collector_notes || undefined,
    reference_image_urls: linkImageUrls?.length ? linkImageUrls : undefined,
    sale_comps: saleCompsToPayload(form.saleComps, linkImageUrls),
    verified: true,
    verified_by: 'Matt Hickey',
  };
}

function formatCatalogSaveError(message: string): string {
  if (/reference_image_urls|sale_comps|original_msrp|catalog_price|inflation_adjusted|colorway_profiles|weight|column/i.test(message)) {
    return `${message}\n\nApply the wrestling_shoes_catalog migrations on Supabase, then try again.`;
  }
  return message;
}

function centsToDollars(cents: number | null | undefined): string {
  return cents != null ? String(Math.round(cents / 100)) : '';
}

function centsToPreciseDollars(cents: number | null | undefined): string {
  if (cents == null) return '';
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function formFromCatalogEntry(entry: CatalogFullEntry): CatalogFormState {
  const rarity = RARITIES.includes(entry.rarity as (typeof RARITIES)[number])
    ? (entry.rarity as (typeof RARITIES)[number])
    : 'common';
  const colorways = (entry.colorways ?? [])
    .map((c) => (typeof c === 'string' ? c : String(c)))
    .filter(Boolean);
  return {
    brand: entry.brand,
    model: entry.model,
    model_aliases: (entry.model_aliases ?? []).join(', '),
    years_produced: entry.years_produced ?? '',
    visual_identifiers: (entry.visual_identifiers ?? []).join('; '),
    sole_description: entry.sole_description ?? '',
    upper_material: entry.upper_material ?? '',
    logo_placement: entry.logo_placement ?? '',
    weight: entry.weight ?? '',
    colorways: colorways.join(', '),
    rarity,
    original_msrp: centsToPreciseDollars(entry.original_msrp_cents),
    catalog_price: centsToPreciseDollars(entry.catalog_price_cents),
    price_source: entry.price_source ?? '',
    inflation_adjusted_price: entry.inflation_adjusted_price ?? '',
    value_low: centsToDollars(entry.value_low_cents),
    value_mid: centsToDollars(entry.value_mid_cents),
    value_high: centsToDollars(entry.value_high_cents),
    collector_notes: entry.collector_notes ?? '',
    saleComps: saleCompsFromEntry(entry.sale_comps),
  };
}

function catalogRowFromEntry(entry: CatalogFullEntry): CatalogRow {
  return {
    id: entry.id,
    brand: entry.brand,
    model: entry.model,
    years_produced: entry.years_produced ?? null,
    rarity: entry.rarity ?? null,
    original_msrp_cents: entry.original_msrp_cents ?? null,
    value_low_cents: entry.value_low_cents ?? null,
    value_mid_cents: entry.value_mid_cents ?? null,
    value_high_cents: entry.value_high_cents ?? null,
    verified: entry.verified ?? false,
    source: entry.source ?? null,
    reference_image_count: entry.reference_image_urls?.length ?? 0,
    sale_comp_count: entry.sale_comps?.length ?? 0,
  };
}

function mergeEnrichmentIntoForm(
  form: CatalogFormState,
  brand: string,
  model: string,
  enrichment: {
    model_aliases: string[];
    era: string;
    colorway?: string;
    colorways?: string[];
    rarity: string;
    visual_matches: string[];
    sole_description?: string;
    upper_material?: string;
    logo_placement?: string;
    value_low_cents: number;
    value_mid_cents: number;
    value_high_cents: number;
    collector_notes: string;
  }
): CatalogFormState {
  const rarity = RARITIES.includes(enrichment.rarity as (typeof RARITIES)[number])
    ? (enrichment.rarity as (typeof RARITIES)[number])
    : form.rarity;
  const colorwayList = enrichment.colorways?.length
    ? enrichment.colorways
    : enrichment.colorway
      ? [enrichment.colorway]
      : [];
  const keepUserColorways = form.colorways.trim();
  return {
    brand,
    model,
    model_aliases: enrichment.model_aliases.join(', '),
    years_produced: enrichment.era || form.years_produced,
    visual_identifiers: enrichment.visual_matches.join('; ') || form.visual_identifiers,
    sole_description: enrichment.sole_description || form.sole_description,
    upper_material: enrichment.upper_material || form.upper_material,
    logo_placement: enrichment.logo_placement || form.logo_placement,
    weight: form.weight,
    colorways: keepUserColorways || colorwayList.join(', '),
    rarity,
    value_low: enrichment.value_low_cents ? centsToDollars(enrichment.value_low_cents) : form.value_low,
    value_mid: enrichment.value_mid_cents ? centsToDollars(enrichment.value_mid_cents) : form.value_mid,
    value_high: enrichment.value_high_cents ? centsToDollars(enrichment.value_high_cents) : form.value_high,
    collector_notes: enrichment.collector_notes || form.collector_notes,
    saleComps: form.saleComps,
    original_msrp: form.original_msrp,
    catalog_price: form.catalog_price,
    price_source: form.price_source,
    inflation_adjusted_price: form.inflation_adjusted_price,
  };
}

function formMatchesAi(result: ShoeIdResult, form: CatalogFormState): boolean {
  const base = formFromResult(result);
  return (
    form.brand === base.brand &&
    form.model.trim() === base.model.trim() &&
    form.years_produced === base.years_produced &&
    form.colorways === base.colorways &&
    form.rarity === base.rarity &&
    form.value_low === base.value_low &&
    form.value_mid === base.value_mid &&
    form.value_high === base.value_high &&
    form.model_aliases === base.model_aliases &&
    form.visual_identifiers === base.visual_identifiers &&
    form.collector_notes === base.collector_notes
  );
}

function ResultSummary({
  result,
  catalogMatchId,
}: {
  result: ShoeIdResult;
  catalogMatchId: string | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[#C9A265]">
          <Sparkles className="h-4 w-4" />
          AI read — edit fields below before saving
        </div>
        <span className="text-xs text-[#666]">{Math.round(result.confidence * 100)}% confidence</span>
      </div>
      <p className="text-xs text-[#888]">
        {result.brand} {result.model} · {result.era} · {result.colorway}
        {catalogMatchId || result.catalog_matched ? ' · catalog match' : ''}
      </p>
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="text-[10px] text-[#555] hover:text-[#888]"
      >
        {showDetails ? 'Hide' : 'Show'} visual matches & notes
      </button>
      {showDetails ? (
        <div className="space-y-2 pt-1 border-t border-[#222]">
          {result.visual_matches.length ? (
            <ul className="text-xs text-[#aaa] space-y-0.5 list-disc pl-4">
              {result.visual_matches.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-[#555]">{result.confidence_note}</p>
        </div>
      ) : null}
    </div>
  );
}

function CatalogForm({
  form,
  setForm,
  onSave,
  onDiscard,
  onClear,
  onUpdateDetails,
  updatingDetails,
  showCorrectionHint,
  showSaleCompsHint,
  referenceImageUrls,
  onRemoveReferenceImage,
  onAddReferencePhotos,
  uploadingReference,
  saving,
  saveLabel,
}: {
  form: CatalogFormState;
  setForm: (f: CatalogFormState) => void;
  onSave: () => void;
  onDiscard?: () => void;
  onClear?: () => void;
  onUpdateDetails?: () => void;
  updatingDetails?: boolean;
  showCorrectionHint?: boolean;
  showSaleCompsHint?: boolean;
  referenceImageUrls?: string[];
  onRemoveReferenceImage?: (url: string) => void;
  onAddReferencePhotos?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingReference?: boolean;
  saving: boolean;
  saveLabel: string;
}) {
  const [pasteText, setPasteText] = useState('');

  const applyStructuredPaste = () => {
    const parsed = parseStructuredCatalogPaste(pasteText);
    if (!parsed?.brand && !parsed?.model) {
      alert('Could not parse — use GPT format with brand: and model: fields.');
      return;
    }
    setForm({
      ...form,
      ...(parsed.brand ? { brand: parsed.brand } : {}),
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.years_produced ? { years_produced: parsed.years_produced } : {}),
      ...(parsed.colorways ? { colorways: parsed.colorways } : {}),
      ...(parsed.visual_identifiers ? { visual_identifiers: parsed.visual_identifiers } : {}),
      ...(parsed.sole_description ? { sole_description: parsed.sole_description } : {}),
      ...(parsed.upper_material ? { upper_material: parsed.upper_material } : {}),
      ...(parsed.weight ? { weight: parsed.weight } : {}),
      ...(parsed.collector_notes ? { collector_notes: parsed.collector_notes } : {}),
      ...(parsed.rarity ? { rarity: parsed.rarity } : {}),
      ...(parsed.original_msrp ? { original_msrp: parsed.original_msrp } : {}),
      ...(parsed.catalog_price ? { catalog_price: parsed.catalog_price } : {}),
      ...(parsed.price_source ? { price_source: parsed.price_source } : {}),
      ...(parsed.inflation_adjusted_price
        ? { inflation_adjusted_price: parsed.inflation_adjusted_price }
        : {}),
    });
    setPasteText('');
  };

  return (
    <div className="space-y-3 rounded-xl border border-[#333] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#aaa]">Catalog entry</p>
        {onClear ? (
          <button type="button" onClick={onClear} className="text-[10px] text-[#666] hover:text-[#aaa]">
            Clear form
          </button>
        ) : null}
      </div>
      <div className="space-y-2 rounded-lg border border-[#C9A265]/40 bg-[#141414] p-3">
        <p className="text-xs font-medium text-[#C9A265]">Paste GPT entry</p>
        <p className="text-[10px] text-[#666]">
          Paste structured GPT output (<code className="text-[#888]">brand:</code>,{' '}
          <code className="text-[#888]">model:</code>, <code className="text-[#888]">colorways:</code>, etc.)
          to fill the fields below.
        </p>
        <textarea
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs min-h-[100px] font-mono"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'brand: Nike\nmodel: Freek\nweight: 10.2 oz (289 g)\nupper_material: synthetic mesh\nyears_produced: 2018-2020\n...'}
        />
        <Button
          type="button"
          size="sm"
          className="w-full bg-[#C9A265] text-black hover:bg-[#C9A265]/90"
          onClick={applyStructuredPaste}
        >
          Fill form from paste
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Brand</Label>
          <select
            className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          >
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Model</Label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
      </div>
      {showCorrectionHint ? (
        <div className="rounded-lg border border-[#333] bg-[#141414] p-3 space-y-2">
          <p className="text-xs text-[#888]">
            Wrong ID? Set the correct brand and model above, add a colorway below if needed, then
            refresh era, values, and notes from your correction.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={updatingDetails || !form.model.trim()}
            onClick={() => onUpdateDetails?.()}
          >
            {updatingDetails ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating details…
              </>
            ) : (
              'Update era & details from correct ID'
            )}
          </Button>
        </div>
      ) : null}
      <div>
        <Label className="text-xs">Era / years produced</Label>
        <Input
          value={form.years_produced}
          onChange={(e) => setForm({ ...form, years_produced: e.target.value })}
          placeholder="e.g. 2013–2016, 2014, or late 1970s"
        />
      </div>
      <div>
        <Label className="text-xs">Aliases (comma-separated)</Label>
        <Input
          value={form.model_aliases}
          onChange={(e) => setForm({ ...form, model_aliases: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Visual identifiers (semicolon-separated)</Label>
        <Input
          value={form.visual_identifiers}
          onChange={(e) => setForm({ ...form, visual_identifiers: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Sole</Label>
          <Input
            value={form.sole_description}
            onChange={(e) => setForm({ ...form, sole_description: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Upper material</Label>
          <Input
            value={form.upper_material}
            onChange={(e) => setForm({ ...form, upper_material: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Logo placement</Label>
        <Input
          value={form.logo_placement}
          onChange={(e) => setForm({ ...form, logo_placement: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Weight</Label>
        <Input
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: e.target.value })}
          placeholder="10.2 oz (289 g)"
        />
      </div>
      <div>
        <Label className="text-xs">Colorways (comma-separated)</Label>
        <Input value={form.colorways} onChange={(e) => setForm({ ...form, colorways: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Rarity</Label>
        <select
          className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={form.rarity}
          onChange={(e) =>
            setForm({ ...form, rarity: e.target.value as (typeof RARITIES)[number] })
          }
        >
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-3 rounded-lg border border-[#C9A265]/30 bg-[#141414] p-3">
        <div>
          <p className="text-xs font-medium text-[#C9A265]">Launch pricing (catalog evidence)</p>
          <p className="text-[10px] text-[#666] mt-1">
            Document MSRP and catalog sale price when you have Eastbay, Wrestling USA, or manufacturer
            sources. Required when a price source is set.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Original MSRP ($)</Label>
            <Input
              value={form.original_msrp}
              onChange={(e) => setForm({ ...form, original_msrp: e.target.value })}
              placeholder="40.00"
            />
          </div>
          <div>
            <Label className="text-xs">Catalog / sale price ($)</Label>
            <Input
              value={form.catalog_price}
              onChange={(e) => setForm({ ...form, catalog_price: e.target.value })}
              placeholder="34.95"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Price source</Label>
          <Input
            list="shoe-id-price-sources"
            value={form.price_source}
            onChange={(e) => setForm({ ...form, price_source: e.target.value })}
            placeholder="Eastbay Catalog"
          />
          <datalist id="shoe-id-price-sources">
            {PRICE_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <Label className="text-xs">Inflation-adjusted MSRP (2026 dollars)</Label>
          <Input
            value={form.inflation_adjusted_price}
            onChange={(e) => setForm({ ...form, inflation_adjusted_price: e.target.value })}
            placeholder="~$75-$80"
          />
        </div>
        {form.original_msrp && form.value_mid ? (
          <p className="text-[10px] text-[#888]">
            Appreciation vs launch MSRP:{' '}
            <span className="text-[#C9A265]">
              {formatAppreciationMultiple(
                dollarsToCents(form.original_msrp),
                dollarsToCents(form.value_mid)
              ) ?? '—'}
            </span>{' '}
            (mid collector value ÷ MSRP)
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Collector value low ($)</Label>
          <Input value={form.value_low} onChange={(e) => setForm({ ...form, value_low: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Collector value mid ($)</Label>
          <Input value={form.value_mid} onChange={(e) => setForm({ ...form, value_mid: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Collector value high ($)</Label>
          <Input value={form.value_high} onChange={(e) => setForm({ ...form, value_high: e.target.value })} />
        </div>
      </div>
      <div className="space-y-3 rounded-lg border border-[#333] bg-[#141414] p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Documented sales</Label>
          <button
            type="button"
            className="text-[10px] text-[#C9A265] hover:underline"
            onClick={() => setForm({ ...form, saleComps: [...form.saleComps, emptySaleComp()] })}
          >
            Add sale
          </button>
        </div>
        <p className="text-[10px] text-[#666]">
          Real pairs that sold at a known price — include size and colorway when you have them (a size 7
          Cherry Freek is not the same comp as a 10.5).
          {showSaleCompsHint ? ' Training photos link to the first sale when you save.' : ''}
        </p>
        {form.saleComps.map((comp, index) => (
          <div key={index} className="space-y-2 rounded-md border border-[#2a2a2a] p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#888]">Sale {index + 1}</span>
              {form.saleComps.length > 1 ? (
                <button
                  type="button"
                  className="text-[10px] text-red-400"
                  onClick={() =>
                    setForm({
                      ...form,
                      saleComps: form.saleComps.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Sold price ($)</Label>
                <Input
                  value={comp.sold_price}
                  onChange={(e) => {
                    const saleComps = [...form.saleComps];
                    saleComps[index] = { ...comp, sold_price: e.target.value };
                    setForm({ ...form, saleComps });
                  }}
                  placeholder="550"
                />
              </div>
              <div>
                <Label className="text-[10px]">Size (US)</Label>
                <Input
                  value={comp.size_us}
                  onChange={(e) => {
                    const saleComps = [...form.saleComps];
                    saleComps[index] = { ...comp, size_us: e.target.value };
                    setForm({ ...form, saleComps });
                  }}
                  placeholder="10.5"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Colorway</Label>
                <Input
                  value={comp.colorway}
                  onChange={(e) => {
                    const saleComps = [...form.saleComps];
                    saleComps[index] = { ...comp, colorway: e.target.value };
                    setForm({ ...form, saleComps });
                  }}
                  placeholder="Cherry"
                />
              </div>
              <div>
                <Label className="text-[10px]">Condition</Label>
                <Input
                  value={comp.condition}
                  onChange={(e) => {
                    const saleComps = [...form.saleComps];
                    saleComps[index] = { ...comp, condition: e.target.value };
                    setForm({ ...form, saleComps });
                  }}
                  placeholder="VNDS, 9/10, deadstock"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Source</Label>
              <Input
                value={comp.source}
                onChange={(e) => {
                  const saleComps = [...form.saleComps];
                  saleComps[index] = { ...comp, source: e.target.value };
                  setForm({ ...form, saleComps });
                }}
                placeholder="Instagram @reseller"
              />
            </div>
            <div>
              <Label className="text-[10px]">Notes</Label>
              <Input
                value={comp.notes}
                onChange={(e) => {
                  const saleComps = [...form.saleComps];
                  saleComps[index] = { ...comp, notes: e.target.value };
                  setForm({ ...form, saleComps });
                }}
                placeholder="OG all, shipped"
              />
            </div>
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs">Collector notes</Label>
        <textarea
          className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-h-[60px]"
          value={form.collector_notes}
          onChange={(e) => setForm({ ...form, collector_notes: e.target.value })}
        />
      </div>
      {referenceImageUrls != null ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Reference photos ({referenceImageUrls.length}/6)</Label>
            {onAddReferencePhotos ? (
              <label className="cursor-pointer text-[10px] text-[#C9A265] hover:underline">
                {uploadingReference ? 'Uploading…' : 'Add photos'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={uploadingReference || referenceImageUrls.length >= 6}
                  onChange={onAddReferencePhotos}
                />
              </label>
            ) : null}
          </div>
          <p className="text-[10px] text-[#666]">
            Confirmed training angles used to visually match this model on future IDs.
          </p>
          {referenceImageUrls.length ? (
            <div className="grid grid-cols-3 gap-2">
              {referenceImageUrls.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="" className="aspect-square rounded-lg object-cover" />
                  {onRemoveReferenceImage ? (
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                      onClick={() => onRemoveReferenceImage(url)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#555]">No reference photos yet.</p>
          )}
        </div>
      ) : null}
      {showCorrectionHint && referenceImageUrls == null ? (
        <p className="text-[10px] text-[#666]">
          Training photos above will be saved as reference images when you add to catalog.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving || !form.model.trim()} className="flex-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
        </Button>
        {onDiscard ? (
          <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ShoeIdAdminClient({ initialCatalog }: { initialCatalog: CatalogRow[] }) {
  const [tab, setTab] = useState<'train' | 'catalog' | 'stats'>('train');
  const [catalog, setCatalog] = useState(initialCatalog);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<ShoeIdResult | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [catalogMatchId, setCatalogMatchId] = useState<string | null>(null);
  const discardResult = () => {
    setResult(null);
    setResultId(null);
    setCatalogMatchId(null);
    setForm(emptyForm());
  };
  const [form, setForm] = useState<CatalogFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [catalogEditForm, setCatalogEditForm] = useState<CatalogFormState>(emptyForm());
  const [catalogEditSaving, setCatalogEditSaving] = useState(false);
  const [catalogEditLoading, setCatalogEditLoading] = useState(false);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [updatingDetails, setUpdatingDetails] = useState(false);
  const [catalogEditRefUrls, setCatalogEditRefUrls] = useState<string[]>([]);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [stats, setStats] = useState<{
    totalCatalog: number;
    verifiedCatalog: number;
    totalIdentifications: number;
    correctFirstTryPct: number;
    catalogMatchRate: number;
    mostMissed: { label: string; count: number }[];
    confidenceBuckets: { label: string; count: number }[];
  } | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/admin/market/shoe-id/stats');
    const data = await res.json();
    if (res.ok) {
      setStats(data);
      const entries = (data.catalog ?? []) as CatalogFullEntry[];
      setCatalog(entries.map(catalogRowFromEntry));
    }
  }, []);

  const uploadShoeIdFiles = async (files: File[], onProgress?: (msg: string) => void) => {
    const uploaded: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `${file.name} is over 4MB — resize or export a smaller JPEG before uploading.`
        );
      }
      onProgress?.(`Uploading ${i + 1} of ${files.length}…`);
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/market/shoe-id/upload', { method: 'POST', body: fd });
      const data = await parseApiJson<{ urls?: string[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const url = data.urls?.[0];
      if (url) uploaded.push(url);
    }
    return uploaded;
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const slotsLeft = Math.max(0, 6 - imageUrls.length);
    const toUpload = files.slice(0, slotsLeft);
    if (!toUpload.length) {
      alert('Maximum 6 photos per identification.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(null);
    try {
      const uploaded = await uploadShoeIdFiles(toUpload, setUploadProgress);
      setImageUrls((prev) => [...prev, ...uploaded].slice(0, 6));
      setResult(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      e.target.value = '';
    }
  };

  const addCatalogRefPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const slotsLeft = Math.max(0, 6 - catalogEditRefUrls.length);
    const toUpload = files.slice(0, slotsLeft);
    if (!toUpload.length) {
      alert('Maximum 6 reference photos per catalog entry.');
      e.target.value = '';
      return;
    }
    setUploadingReference(true);
    try {
      const uploaded = await uploadShoeIdFiles(toUpload);
      setCatalogEditRefUrls((prev) => [...prev, ...uploaded].slice(0, 6));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingReference(false);
      e.target.value = '';
    }
  };

  const identify = async () => {
    if (!imageUrls.length) return;
    setIdentifying(true);
    setResult(null);
    try {
      const res = await fetch('/api/market/shoe-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imageUrls }),
      });
      const data = await parseApiJson<{
        result: ShoeIdResult;
        resultId: string | null;
        catalogMatchId: string | null;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || 'Identify failed');
      setResult(data.result);
      setResultId(data.resultId ?? null);
      setCatalogMatchId(data.catalogMatchId);
      setForm(formFromResult(data.result));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Identify failed');
    } finally {
      setIdentifying(false);
    }
  };

  const updateDetailsFromCorrection = async () => {
    if (!imageUrls.length || !form.model.trim()) return;
    setUpdatingDetails(true);
    try {
      const colorwayHint = form.colorways.split(',')[0]?.trim();
      const res = await fetch('/api/admin/market/shoe-id/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imageUrls,
          brand: form.brand,
          model: form.model.trim(),
          colorway: colorwayHint || undefined,
          wrongBrand: result?.brand,
          wrongModel: result?.model,
          resultId: resultId ?? undefined,
        }),
      });
      const data = await parseApiJson<{
        source: 'catalog' | 'ai';
        brand: string;
        model: string;
        enrichment: {
          model_aliases: string[];
          era: string;
          colorway?: string;
          colorways?: string[];
          rarity: string;
          visual_matches: string[];
          sole_description?: string;
          upper_material?: string;
          logo_placement?: string;
          value_low_cents: number;
          value_mid_cents: number;
          value_high_cents: number;
          collector_notes: string;
        };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setForm(mergeEnrichmentIntoForm(form, data.brand, data.model, data.enrichment));
      if (result) {
        setResult({
          ...result,
          brand: data.brand,
          model: data.model,
          era: data.enrichment.era,
          colorway: data.enrichment.colorway ?? result.colorway,
          rarity: data.enrichment.rarity as ShoeIdResult['rarity'],
          visual_matches: data.enrichment.visual_matches,
          value_low_cents: data.enrichment.value_low_cents,
          value_mid_cents: data.enrichment.value_mid_cents,
          value_high_cents: data.enrichment.value_high_cents,
          collector_notes: data.enrichment.collector_notes,
          catalog_matched: data.source === 'catalog',
        });
      }
      alert(
        data.source === 'catalog'
          ? 'Loaded details from catalog match.'
          : 'Updated era, values, and notes from your correction.'
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingDetails(false);
    }
  };

  const saveConfirm = async () => {
    if (!form.model.trim()) {
      alert('Model is required before saving.');
      return;
    }
    if (form.price_source.trim() && !form.original_msrp.trim()) {
      alert('Original MSRP is required when you document a price source (e.g. Eastbay catalog).');
      return;
    }
    if (!result) {
      alert('Run Identify first, then save to catalog.');
      return;
    }
    const wasCorrect = formMatchesAi(result, form);
    const catalogPayload = formToPayload(form, imageUrls);
    const saleCount = catalogPayload.sale_comps?.length ?? 0;
    const refCount = imageUrls.length;
    setSaving(true);
    try {
      const res = resultId
        ? await fetch('/api/admin/market/shoe-id/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resultId,
              wasCorrect,
              catalog: catalogPayload,
              referenceImageUrls: imageUrls,
            }),
          })
        : await fetch('/api/admin/market/shoe-id/catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...catalogPayload,
              source: wasCorrect ? 'handbook' : 'manual',
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(formatCatalogSaveError(data.error || 'Save failed'));
      discardResult();
      setImageUrls([]);
      await refreshCatalog();
      const parts = [`Catalog entry saved`];
      if (refCount) parts.push(`${refCount} ref photo${refCount === 1 ? '' : 's'}`);
      if (saleCount) parts.push(`${saleCount} sale comp${saleCount === 1 ? '' : 's'}`);
      alert(parts.join(' — ') + '.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this catalog entry?')) return;
    const res = await fetch(`/api/admin/market/shoe-id/catalog/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setCatalog((prev) => prev.filter((e) => e.id !== id));
      if (editingCatalogId === id) cancelCatalogEdit();
    }
  };

  const refreshCatalog = async () => {
    const catRes = await fetch('/api/admin/market/shoe-id/catalog');
    const catData = await catRes.json();
    if (catRes.ok) {
      const entries = (catData.entries ?? []) as CatalogFullEntry[];
      setCatalog(entries.map(catalogRowFromEntry));
    }
  };

  const startEditEntry = async (id: string) => {
    setPendingEditId(id);
    setCatalogEditLoading(true);
    try {
      const res = await fetch('/api/admin/market/shoe-id/catalog');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load entry');
      const entry = ((data.entries ?? []) as CatalogFullEntry[]).find((e) => e.id === id);
      if (!entry) throw new Error('Catalog entry not found');
      setEditingCatalogId(id);
      setCatalogEditForm(formFromCatalogEntry(entry));
      setCatalogEditRefUrls(entry.reference_image_urls ?? []);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load entry');
    } finally {
      setCatalogEditLoading(false);
      setPendingEditId(null);
    }
  };

  const cancelCatalogEdit = () => {
    setEditingCatalogId(null);
    setCatalogEditForm(emptyForm());
    setCatalogEditRefUrls([]);
  };

  const saveCatalogEdit = async () => {
    if (!editingCatalogId) return;
    if (!catalogEditForm.model.trim()) {
      alert('Model is required before saving.');
      return;
    }
    if (catalogEditForm.price_source.trim() && !catalogEditForm.original_msrp.trim()) {
      alert('Original MSRP is required when you document a price source (e.g. Eastbay catalog).');
      return;
    }
    setCatalogEditSaving(true);
    try {
      const res = await fetch(`/api/admin/market/shoe-id/catalog/${editingCatalogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formToPayload(catalogEditForm, catalogEditRefUrls),
          reference_image_urls: catalogEditRefUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatCatalogSaveError(data.error || 'Save failed'));
      await refreshCatalog();
      cancelCatalogEdit();
      alert('Catalog entry updated.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setCatalogEditSaving(false);
    }
  };

  const importJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/admin/market/shoe-id/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      const catRes = await fetch('/api/admin/market/shoe-id/catalog');
      const catData = await catRes.json();
      if (catRes.ok) {
        const entries = (catData.entries ?? []) as CatalogFullEntry[];
        setCatalog(entries.map(catalogRowFromEntry));
      }
      alert(`Imported ${data.imported} entries.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
    e.target.value = '';
  };

  const exportCatalog = () => {
    void (async () => {
      const res = await fetch('/api/admin/market/shoe-id/catalog');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.entries ?? [], null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wrestling-shoes-catalog.json';
      a.click();
    })();
  };

  const tabs = [
    { id: 'train' as const, label: 'Identify & train' },
    { id: 'catalog' as const, label: 'Catalog manager' },
    { id: 'stats' as const, label: 'Training stats' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id === 'stats') void loadStats();
            }}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium',
              tab === t.id ? 'bg-[#C9A265] text-black' : 'border border-[#333] text-[#888]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'train' ? (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-[#888]">
            Upload up to 6 photos of the same pair from different angles — top, outsole, both
            sides, heel, and toe — then run identification.
          </p>
          <label className="flex flex-col items-center gap-2 border border-dashed border-[#333] rounded-xl py-8 cursor-pointer hover:border-[#C9A265]">
            <Upload className="h-5 w-5 text-[#666]" />
            <span className="text-sm text-[#666]">
              {uploadProgress || (uploading ? 'Uploading…' : `Add photos (${imageUrls.length}/6)`)}
            </span>
            <span className="text-[10px] text-[#555]">Max 4MB per photo — upload one angle at a time</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
          </label>
          {imageUrls.length ? (
            <div className="grid grid-cols-3 gap-2">
              {imageUrls.map((url) => (
                <img key={url} src={url} alt="" className="aspect-square rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
          <Button
            onClick={() => void identify()}
            disabled={!imageUrls.length || identifying}
            className="w-full bg-[#C9A265] text-black"
          >
            {identifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Identifying…
              </>
            ) : (
              'Identify'
            )}
          </Button>
          {result ? (
            <>
              <ResultSummary result={result} catalogMatchId={catalogMatchId} />
              {!resultId ? (
                <p className="text-sm text-amber-400/90">
                  Session log unavailable — catalog will still save when you click Save to catalog.
                </p>
              ) : null}
              <CatalogForm
                form={form}
                setForm={setForm}
                saving={saving}
                saveLabel="Save to catalog"
                onSave={() => void saveConfirm()}
                onDiscard={discardResult}
                onClear={() => setForm(emptyForm())}
                showCorrectionHint
                showSaleCompsHint
                updatingDetails={updatingDetails}
                onUpdateDetails={() => void updateDetailsFromCorrection()}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'catalog' ? (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <label className="cursor-pointer">
              <span className="inline-flex items-center rounded-md border border-[#333] px-3 py-1.5 text-sm">
                Import from JSON
              </span>
              <input type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
            </label>
            <button
              type="button"
              className="rounded-md border border-[#333] px-3 py-1.5 text-sm"
              onClick={exportCatalog}
            >
              Export catalog
            </button>
          </div>
          {editingCatalogId ? (
            <CatalogForm
              form={catalogEditForm}
              setForm={setCatalogEditForm}
              saving={catalogEditSaving}
              saveLabel="Save changes"
              onSave={() => void saveCatalogEdit()}
              onDiscard={cancelCatalogEdit}
              referenceImageUrls={catalogEditRefUrls}
              onRemoveReferenceImage={(url) =>
                setCatalogEditRefUrls((prev) => prev.filter((u) => u !== url))
              }
              onAddReferencePhotos={addCatalogRefPhotos}
              uploadingReference={uploadingReference}
            />
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[#222]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#222] text-left text-[#666]">
                  <th className="p-2">Brand</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Years</th>
                  <th className="p-2">Rarity</th>
                  <th className="p-2">MSRP</th>
                  <th className="p-2">Value</th>
                  <th className="p-2">Multiple</th>
                  <th className="p-2">Refs</th>
                  <th className="p-2">Sales</th>
                  <th className="p-2">Verified</th>
                  <th className="p-2">Source</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {catalog.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-[#1a1a1a]',
                      editingCatalogId === row.id && 'bg-[#1a1a1a]'
                    )}
                  >
                    <td className="p-2">{row.brand}</td>
                    <td className="p-2">{row.model}</td>
                    <td className="p-2 text-[#888]">{row.years_produced ?? '—'}</td>
                    <td className="p-2 capitalize">{row.rarity ?? '—'}</td>
                    <td className="p-2 text-[#888]">
                      {row.original_msrp_cents != null
                        ? `$${(row.original_msrp_cents / 100).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="p-2 text-[#888]">
                      {row.value_low_cents != null
                        ? `$${row.value_low_cents / 100}–$${(row.value_high_cents ?? 0) / 100}`
                        : '—'}
                    </td>
                    <td className="p-2 text-[#C9A265]">
                      {formatAppreciationMultiple(row.original_msrp_cents, row.value_mid_cents) ?? '—'}
                    </td>
                    <td className="p-2 text-[#888]">{row.reference_image_count || '—'}</td>
                    <td className="p-2 text-[#888]">{row.sale_comp_count || '—'}</td>
                    <td className="p-2">{row.verified ? '✓' : '—'}</td>
                    <td className="p-2 text-[#888]">{row.source ?? '—'}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-[#C9A265] disabled:opacity-50"
                          disabled={catalogEditLoading}
                          onClick={() => void startEditEntry(row.id)}
                        >
                          {pendingEditId === row.id ? 'Loading…' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400"
                          onClick={() => void deleteEntry(row.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {catalog.length === 0 ? (
              <p className="p-4 text-sm text-[#666] text-center">No catalog entries yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="space-y-4 max-w-md">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Catalog entries</p>
                  <p className="text-xl font-semibold">{stats.totalCatalog}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Verified</p>
                  <p className="text-xl font-semibold">{stats.verifiedCatalog}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Identifications</p>
                  <p className="text-xl font-semibold">{stats.totalIdentifications}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Catalog match rate</p>
                  <p className="text-xl font-semibold">{stats.catalogMatchRate}%</p>
                </div>
              </div>
              <p className="text-sm text-[#888]">
                Correct on first try: {stats.correctFirstTryPct}% of runs
              </p>
              {stats.mostMissed.length ? (
                <div>
                  <p className="text-xs text-[#666] mb-2">Most missed IDs</p>
                  <ul className="text-sm space-y-1">
                    {stats.mostMissed.map((m) => (
                      <li key={m.label} className="flex justify-between">
                        <span>{m.label}</span>
                        <span className="text-[#888]">{m.count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-[#666] mb-2">Confidence distribution</p>
                {stats.confidenceBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 mb-1 text-sm">
                    <span className="w-20 text-[#888]">{b.label}</span>
                    <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C9A265]"
                        style={{
                          width: `${stats.totalIdentifications ? (b.count / stats.totalIdentifications) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right">{b.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#666]">Loading stats…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
