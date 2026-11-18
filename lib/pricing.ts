/**
 * Standardized revenue split: coach receives 85% of gross from parents; guild/platform 15%.
 * The 15% is all-in — it funds the liability insurance program (set 18 Nov 2026; was 80/20).
 * Applied consistently across session types, estimates, and payout suggestions.
 */
export const COACH_REVENUE_FRACTION = 0.85;
export const GUILD_REVENUE_FRACTION = 0.15;

/**
 * Coach payout is platform-wide and cannot be overridden per coach or session.
 * The argument remains for compatibility with callers reading legacy DB columns.
 */
export function normalizeCoachRevenueShareRate(_rate: number | null | undefined): number {
  return COACH_REVENUE_FRACTION;
}

/** Whole percent for UI labels (e.g. 85). */
export function coachRevenueSharePercentDisplay(rate: number | null | undefined): number {
  return Math.round(normalizeCoachRevenueShareRate(rate) * 100);
}

/** For UI display (e.g. "Guild share: ~15%") */
export const GUILD_PERCENT_DISPLAY = Math.round(GUILD_REVENUE_FRACTION * 100);

/** Coach payout per participant from parent price: parentPrice * COACH_REVENUE_FRACTION, rounded to cents */
export function coachPayoutFromParentPrice(parentPrice: number): number {
  return Math.round(parentPrice * COACH_REVENUE_FRACTION * 100) / 100;
}
