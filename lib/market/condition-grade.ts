export type MarketConditionGrade = 'new' | 'like_new' | 'good' | 'fair';

/** Listing grade from wrestle-ready score — calibrated for used wrestling shoes, not deadstock sneakers. */
export function gradeFromWrestleScore(score: number): MarketConditionGrade {
  const s = Math.round(Math.min(10, Math.max(1, score)));
  if (s >= 9) return 'new';
  if (s >= 8) return 'like_new';
  if (s >= 5) return 'good';
  return 'fair';
}

/** @deprecated Use gradeFromWrestleScore */
export const gradeFromConditionScore = gradeFromWrestleScore;

export function cosmeticAppearanceLabel(score: number): string {
  const s = Math.round(Math.min(10, Math.max(1, score)));
  if (s >= 9) return 'Pristine appearance';
  if (s >= 7) return 'Light cosmetic wear';
  if (s >= 5) return 'Normal used wear (typical for whites)';
  return 'Heavy damage or very beat';
}

export const WRESTLE_SCORE_HINT = '5–7 = good practice pair · 8+ = like new';

/**
 * Guild Market calibration: parents buy function. Yellowing/dirt on mat-used whites is normal.
 * Prevents StockX-style harsh cosmetic scores from dominating.
 */
export function calibrateGuildConditionScores(
  wrestle: number,
  cosmetic: number
): { wrestle_score: number; cosmetic_score: number } {
  let w = Math.round(Math.min(10, Math.max(1, wrestle)));
  let c = Math.round(Math.min(10, Math.max(1, cosmetic)));

  // Typical used wrestling shoe: functional with dirty/yellowed uppers
  if (w >= 5 && c < 5) c = 5;

  // Intact tread pairs often land at 6 from conservative AI — nudge up when still clearly usable
  if (w >= 5 && w <= 6 && c <= 6) w = Math.max(w, 7);

  // Cosmetic should not trail wrestle by more than 3 for normal mat wear
  if (w - c > 3) c = w - 3;

  return { wrestle_score: w, cosmetic_score: c };
}
