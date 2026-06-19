import type { MarketWearState } from '@/lib/market/wear-state';
import { listingConditionDisplay } from '@/lib/market/wear-state';

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

  const tip = analysis?.listing_tip?.trim();
  if (tip && tip !== summary && tip !== cosmetic) {
    lines.push('', tip);
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
  conditionAnalysis?: {
    wrestle_score?: number;
    grade?: string;
    listing_tip?: string;
    breakdown?: Partial<Record<string, { note?: string }>>;
  } | null;
};

/** User message for the listing agent when auto-writing description from known fields. */
export function buildListingAgentPrompt(input: ListingAgentPromptInput): string {
  const lines = [
    'Write a buyer-facing listing description for these wrestling shoes using the details below.',
    'Return has_draft: true with a concise, honest description (2–4 short paragraphs).',
    'Never include score numbers, Guild ratings, Historical/Interest/Rarity/Cultural scales, or "/10" in the description.',
    '',
    `Brand: ${input.brand || 'unknown'}`,
    `Model: ${input.model || 'unknown'}`,
    input.colorway?.trim() ? `Colorway: ${input.colorway.trim()}` : null,
    input.modelYear ? `Model year: ${input.modelYear}` : null,
    `Size: ${input.size} US`,
    `Wear state: ${input.wearState}`,
    `Condition grade: ${input.condition}`,
    input.listingType ? `Listing type: ${input.listingType}` : null,
  ].filter(Boolean) as string[];

  if (input.conditionAnalysis) {
    const a = input.conditionAnalysis;
    if (a.wrestle_score != null) lines.push(`Wrestle-ready (private): ${a.wrestle_score}/10`);
    if (a.grade) lines.push(`Suggested grade (private): ${a.grade}`);
    if (a.listing_tip?.trim()) lines.push(`Photo notes (private): ${a.listing_tip.trim()}`);
    for (const part of ['sole', 'upper', 'midsole', 'laces'] as const) {
      const note = a.breakdown?.[part]?.note?.trim();
      if (note) lines.push(`${part} (private): ${note}`);
    }
  }

  if (input.sellerNote?.trim()) {
    lines.push('', `Seller added detail: ${input.sellerNote.trim()}`);
  }

  return lines.join('\n');
}
