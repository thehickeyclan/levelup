/** Volunteer areas for the Guild Tournament of Champions. Shared by form + admin. */
export const TOURNAMENT_VOLUNTEER_ROLES = [
  'Concessions',
  'Soliciting sponsors',
  'Ticketing',
  'Tournament-day staffing',
  'Setup & teardown',
  'Weigh-ins & skin checks',
  'Apparel & merchandise',
  'Hospitality (coaches & officials)',
  'Scoring & bracket table',
  'Awards',
  'Photography & media',
  'Wherever I am needed most',
] as const;

export type TournamentVolunteerRole = (typeof TOURNAMENT_VOLUNTEER_ROLES)[number];

export const TOURNAMENT_VOLUNTEER_AVAILABILITY = [
  'Tournament day',
  'Setup day (day before)',
  'Both days',
  'Flexible / not sure yet',
] as const;

export function isTournamentVolunteerRole(value: string): boolean {
  return (TOURNAMENT_VOLUNTEER_ROLES as readonly string[]).includes(value);
}
