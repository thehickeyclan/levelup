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
  const { brand, model, colorway, modelYear, size, wearState, condition, analysis } = input;
  const titleParts = [brand, model].filter(Boolean).join(' ');
  const yearBit = modelYear ? ` (${modelYear})` : '';
  const colorBit = colorway?.trim() ? ` — ${colorway.trim()}` : '';
  const conditionLabel = listingConditionDisplay(wearState, condition);

  const lines: string[] = [
    `${titleParts}${yearBit}${colorBit} — Size ${size} US.`,
    '',
    `${conditionLabel}.`,
  ];

  const summary = analysis?.summary?.trim();
  if (summary) {
    lines.push('', summary);
  }

  const cosmetic = analysis?.cosmetic_summary?.trim();
  if (cosmetic && cosmetic !== summary) {
    lines.push('', cosmetic);
  }

  if (wearState === 'bnib') {
    lines.push('', 'Unworn with original box. See photos.');
  } else if (wearState === 'new_no_box') {
    lines.push('', 'Unworn deadstock without box. See photos.');
  } else {
    lines.push('', 'See photos for exact wear.');
  }

  return lines.join('\n').trim();
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
    listing_tip?: string;
    breakdown?: Partial<Record<string, { note?: string }>>;
  } | null;
};

/** User message for the listing agent when auto-writing description from known fields. */
export function buildListingAgentPrompt(input: ListingAgentPromptInput): string {
  const lines = [
    'Write a buyer-facing listing description for these wrestling shoes.',
    'Return has_draft: true with the full description in draft.description.',
    '',
    LISTING_DESCRIPTION_FORMAT,
    '',
    '--- Listing facts ---',
    `Brand: ${input.brand || 'unknown'}`,
    `Model: ${input.model || 'unknown'}`,
    input.colorway?.trim() ? `Colorway: ${input.colorway.trim()}` : null,
    input.modelYear ? `Model year / era: ${input.modelYear}` : null,
    input.weightClass?.trim() ? `Weight: ${input.weightClass.trim()}` : null,
    input.rarity ? `Rarity tier: ${input.rarity}` : null,
    `Size: ${input.size} US`,
    `Wear state: ${input.wearState}`,
    `Condition grade: ${input.condition}`,
    input.listingType ? `Listing type: ${input.listingType}` : null,
    input.collectorNotes?.trim() ? `Catalog / collector notes: ${input.collectorNotes.trim()}` : null,
  ].filter(Boolean) as string[];

  if (input.conditionAnalysis) {
    lines.push('', '--- Photo condition analysis (private — translate to Condition bullets, no scores) ---');
    const a = input.conditionAnalysis;
    if (a.listing_tip?.trim()) lines.push(`Seller photo tip (do NOT quote): ${a.listing_tip.trim()}`);
    for (const part of ['sole', 'upper', 'midsole', 'laces'] as const) {
      const note = a.breakdown?.[part]?.note?.trim();
      if (note) lines.push(`${part}: ${note}`);
    }
  }

  if (input.sellerNote?.trim()) {
    lines.push('', `Seller personal note: ${input.sellerNote.trim()}`);
  }

  return lines.join('\n');
}
