import type { MarketWearState } from '@/lib/market/wear-state';
import { listingConditionDisplay } from '@/lib/market/wear-state';

export type ListingDescriptionInput = {
  brand: string;
  model: string;
  modelYear?: number | null;
  size: number;
  wearState: MarketWearState;
  condition: string;
  analysis?: {
    summary?: string;
    cosmetic_summary?: string;
  } | null;
};

/** Buyer-facing listing copy — no AI scores or internal pricing notes. */
export function buildListingDescription(input: ListingDescriptionInput): string {
  const { brand, model, modelYear, size, wearState, condition, analysis } = input;
  const titleParts = [brand, model].filter(Boolean).join(' ');
  const yearBit = modelYear ? ` (${modelYear})` : '';
  const conditionLabel = listingConditionDisplay(wearState, condition);

  const lines: string[] = [
    `${titleParts}${yearBit} — Size ${size} US.`,
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
