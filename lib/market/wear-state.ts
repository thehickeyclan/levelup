export type MarketWearState = 'bnib' | 'new_no_box' | 'used';

export const WEAR_STATE_OPTIONS: readonly {
  value: MarketWearState;
  label: string;
  hint: string;
}[] = [
  { value: 'bnib', label: 'Brand new in box (BNIB)', hint: 'Unworn, original box included' },
  { value: 'new_no_box', label: 'Brand new — no box', hint: 'Unworn deadstock, box not included' },
  { value: 'used', label: 'Used', hint: 'Worn on the mat — pick a condition grade below' },
];

export const USED_CONDITIONS = ['like_new', 'good', 'fair'] as const;

export function wearStateLabel(state: MarketWearState): string {
  return WEAR_STATE_OPTIONS.find((o) => o.value === state)?.label ?? state;
}

/** Maps wear_state to listing condition column for new items. */
export function conditionForWearState(
  wearState: MarketWearState,
  usedCondition: string
): 'new' | 'like_new' | 'good' | 'fair' {
  if (wearState === 'bnib' || wearState === 'new_no_box') return 'new';
  if (usedCondition === 'like_new' || usedCondition === 'good' || usedCondition === 'fair') {
    return usedCondition;
  }
  return 'good';
}

export function listingConditionDisplay(wearState: MarketWearState, condition: string): string {
  if (wearState === 'bnib') return 'BNIB';
  if (wearState === 'new_no_box') return 'New (no box)';
  return condition.replace('_', ' ');
}
