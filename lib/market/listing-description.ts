import type { MarketWearState } from '@/lib/market/wear-state';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { LISTING_DESCRIPTION_FORMAT } from '@/lib/market/ai/prompts';

export type ListingDescriptionInput = {
  brand: string;
  model: string;
  colorway?: string | null;
  modelYear?: number | null;
  size: number;
  wearState: MarketWearState;
  condition: string;
  analysis?: {
    summary?: string;
    cosmetic_summary?: string;
    listing_tip?: string;
  } | null;
};

/** Buyer-facing listing copy — no AI scores or internal pricing notes. */
export function buildListingDescription(input: ListingDescriptionInput): string {
  const { brand, model, colorway, wearState, condition, analysis } = input;
  const name = [brand, model].filter(Boolean).join(' ').trim();
  const cw = colorway?.trim();
  const catalogLine = analysis?.summary?.trim();

  const wearClosing =
    wearState === 'bnib'
      ? 'Unworn with original box. See photos.'
      : wearState === 'new_no_box'
        ? 'Unworn deadstock without box. See photos.'
        : `${listingConditionDisplay(wearState, condition)}. See photos for exact wear.`;

  if (catalogLine) {
    return `${catalogLine}\n\n${wearClosing}`;
  }

  const opener = cw
    ? `The ${name} in the "${cw}" colorway.`
    : name
      ? `The ${name}.`
      : 'Wrestling shoes.';
  return `${opener} ${wearClosing}`;
}

/** Respect manual edits on save — only auto-fill when the seller never touched the field. */
export function resolveListingDescriptionForSave(
  description: string,
  touched: boolean,
  fallbackInput: ListingDescriptionInput
): string {
  const trimmed = description.trim();
  if (touched) return trimmed;
  return trimmed || buildListingDescription(fallbackInput);
}

export type ListingAgentPromptInput = {
  brand: string;
  model: string;
  colorway?: string;
  modelYear?: number | null;
  size: number;
  wearState: MarketWearState;
  condition: string;
  listingType?: string;
  sellerNote?: string;
  rarity?: string | null;
  weightClass?: string | null;
  collectorNotes?: string | null;
  conditionAnalysis?: {
    summary?: string;
    listing_tip?: string;
    breakdown?: Partial<Record<string, { note?: string }>>;
  } | null;
};

/** User message for the listing agent when auto-writing description from known fields. */
export function buildListingAgentPrompt(input: ListingAgentPromptInput): string {
  const lines = [
    'Write a single flowing buyer-facing paragraph for this wrestling shoe (see format rules).',
    'Return has_draft: true with the full description in draft.description.',
    'Do not repeat size, condition grade, or bullet field lists — those appear elsewhere on the listing.',
    '',
    LISTING_DESCRIPTION_FORMAT,
    '',
    '--- Context for writing (do not paste as a field list in the description) ---',
    `Brand: ${input.brand || 'unknown'}`,
    `Model: ${input.model || 'unknown'}`,
    input.colorway?.trim() ? `Colorway: ${input.colorway.trim()}` : null,
    input.modelYear ? `Model year / era: ${input.modelYear}` : null,
    input.weightClass?.trim() ? `Weight class: ${input.weightClass.trim()}` : null,
    input.rarity ? `Rarity tier: ${input.rarity}` : null,
    `Size on listing: ${input.size} US (do not put size in the description)`,
    `Wear state: ${input.wearState}${input.wearState === 'bnib' ? ' (brand new in box — unworn)' : input.wearState === 'new_no_box' ? ' (unworn, no box)' : ''}`,
    `Condition grade on listing: ${input.condition} (do not restate as a label — used pairs may add one brief wear sentence)`,
    input.listingType ? `Listing type: ${input.listingType}` : null,
    input.collectorNotes?.trim() ? `Catalog / collector notes: ${input.collectorNotes.trim()}` : null,
  ].filter(Boolean) as string[];

  if (input.conditionAnalysis && input.wearState === 'used') {
    lines.push('', '--- Photo notes (optional one-sentence wear closing only — no scores) ---');
    const a = input.conditionAnalysis;
    if (a.listing_tip?.trim()) lines.push(`Photo tip (do NOT quote): ${a.listing_tip.trim()}`);
    for (const part of ['sole', 'upper', 'midsole', 'laces'] as const) {
      const note = a.breakdown?.[part]?.note?.trim();
      if (note) lines.push(`${part}: ${note}`);
    }
  } else if (input.wearState === 'bnib' || input.wearState === 'new_no_box') {
    lines.push(
      '',
      '--- Wear state rules ---',
      input.wearState === 'bnib'
        ? 'BNIB — paragraph must describe unworn stock + box. No tread wear or used-shoe language.'
        : 'Unworn without box — paragraph must describe unworn deadstock. No mat wear language.'
    );
    const a = input.conditionAnalysis;
    if (a?.summary?.trim()) {
      lines.push(`Photo verification (BNIB/unworn only): ${a.summary.trim()}`);
    }
  }

  if (input.sellerNote?.trim()) {
    lines.push('', `Seller personal note: ${input.sellerNote.trim()}`);
  }

  return lines.join('\n');
}
