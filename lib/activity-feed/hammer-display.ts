/** Wrestler slang for tough respect — UI only; DB table stays `activity_kudos`. */
export const HAMMER_EMOJI = '🔨';

export function hammerNoun(count: number): string {
  return count === 1 ? 'hammer' : 'hammers';
}

/** Coach widget / summaries: "3 hammers on your sessions this week" */
export function hammerCountPhrase(count: number): string {
  return `${count} ${hammerNoun(count)}`;
}

/** Feed card button: "Hammer" or "5 hammers" */
export function hammerButtonLabel(count: number): string {
  return count > 0 ? hammerCountPhrase(count) : 'Hammer';
}
