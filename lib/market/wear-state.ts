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

/** Browse filter buckets — aligned with listingConditionDisplay labels. */
export const BROWSE_CONDITION_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'bnib', label: 'BNIB' },
  { id: 'new_no_box', label: 'New (no box)' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
] as const;

export type BrowseConditionFilter = (typeof BROWSE_CONDITION_OPTIONS)[number]['id'];

export type BrowseConditionBucket = Exclude<BrowseConditionFilter, 'all'>;

export function browseConditionBucket(
  condition: string,
  wearState: string | null | undefined
): BrowseConditionBucket {
  if (wearState === 'bnib') return 'bnib';
  if (wearState === 'new_no_box') return 'new_no_box';
  if (condition === 'like_new' || condition === 'good' || condition === 'fair') {
    return condition;
  }
  if (condition === 'new') return 'new_no_box';
  return 'good';
}

/** Legacy `condition=new` URL param matches both unworn buckets. */
export function matchesBrowseConditionFilter(
  condition: string,
  wearState: string | null | undefined,
  filter: BrowseConditionFilter | 'new'
): boolean {
  if (filter === 'all') return true;
  const bucket = browseConditionBucket(condition, wearState);
  if (filter === 'new') return bucket === 'bnib' || bucket === 'new_no_box';
  return bucket === filter;
}
