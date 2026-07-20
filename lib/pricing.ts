/**
 * Standardized revenue split: coach receives 80% of gross from parents; guild/platform 20%.
 * Applied consistently across session types, estimates, and payout suggestions.
 */
export const COACH_REVENUE_FRACTION = 0.8;
export const GUILD_REVENUE_FRACTION = 1 - COACH_REVENUE_FRACTION;

/**
 * Coach payout is platform-wide and cannot be overridden per coach or session.
 * The argument remains for compatibility with callers reading legacy DB columns.
 */
export function normalizeCoachRevenueShareRate(_rate: number | null | undefined): number {
  return COACH_REVENUE_FRACTION;
}

/** Whole percent for UI labels (e.g. 80). */
export function coachRevenueSharePercentDisplay(rate: number | null | undefined): number {
  return Math.round(normalizeCoachRevenueShareRate(rate) * 100);
}

/** For UI display (e.g. "Guild share: ~20%") */
export const GUILD_PERCENT_DISPLAY = 20;

/** Coach payout per participant from parent price: parentPrice * COACH_REVENUE_FRACTION, rounded to cents */
export function coachPayoutFromParentPrice(parentPrice: number): number {
  return Math.round(parentPrice * COACH_REVENUE_FRACTION * 100) / 100;
}
