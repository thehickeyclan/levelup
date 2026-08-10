export const TOC_GIVEAWAY_CAMPAIGN = 'toc_2026';
export const TOC_GIVEAWAY_CREDIT_AMOUNT = 100;
export const TOC_GIVEAWAY_DEADLINE_LABEL = 'September 15, 2026';

const TOC_DEADLINE_END_UTC = Date.UTC(2026, 8, 16, 3, 59, 59, 999); // Sep 15, 2026 11:59:59 PM ET

export function normalizeTocCampaign(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === TOC_GIVEAWAY_CAMPAIGN ? TOC_GIVEAWAY_CAMPAIGN : null;
}

export function isTocGiveawayOpen(now = new Date()): boolean {
  return now.getTime() <= TOC_DEADLINE_END_UTC;
}

