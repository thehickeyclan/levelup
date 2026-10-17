/**
 * Guild Recruiting marketing pages — shared config.
 *
 * The recruiting product lives in its own codebase at recruit.wrestlingguild.com;
 * this file only powers the hidden front door and state pages on this site.
 *
 * HARD RULE (Matt): nothing about Guild Recruiting is public until the flag
 * below ships as true. Pages 404 for everyone but admins, carry noindex, and
 * add no menu/footer/homepage text while the flag is off.
 */

/** One switch flips launch: menu item, footer line, public pages, shortcuts. */
export const GUILD_RECRUITING_PUBLIC =
  process.env.NEXT_PUBLIC_GUILD_RECRUITING_PUBLIC === 'true';

export const RECRUIT_APP_ORIGIN = 'https://recruit.wrestlingguild.com';

export const RECRUIT_LINKS = {
  createProfile: `${RECRUIT_APP_ORIGIN}/create-profile`,
  coachSignup: `${RECRUIT_APP_ORIGIN}/auth/signup?type=college-coach`,
  signIn: `${RECRUIT_APP_ORIGIN}/auth/signin`,
  athletesByState: (code: string) =>
    `${RECRUIT_APP_ORIGIN}/prospects/all?state=${code.toUpperCase()}`,
};

export type RecruitingState = { code: string; name: string; live: boolean };

/** Adding a state = one entry here (plus a 3-line shortcut route, see /app/recruitnc). */
export const RECRUITING_STATES: RecruitingState[] = [
  { code: 'nc', name: 'North Carolina', live: true },
  { code: 'sc', name: 'South Carolina', live: false },
];

export function getRecruitingState(code: string): RecruitingState | null {
  const normalized = code.trim().toLowerCase();
  return RECRUITING_STATES.find((s) => s.code === normalized) ?? null;
}

/** Exact wording per Matt — do not edit without his approval. */
export const RECRUITING_INTEGRITY_RULE =
  'Purchasing Guild Training does not influence rankings, placement, profile visibility, or treatment within Guild Recruiting. Rankings are based on verified results. Paid placement is prohibited.';

/**
 * PLACEHOLDER — Matt has not approved the legal footer wording. Shown only
 * while GUILD_RECRUITING_PUBLIC is on. Change the value only on his say-so.
 */
export const GUILD_VENTURES_FOOTER_LINE = 'A Guild Ventures company';
