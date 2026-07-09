export type ShareGraphicThemeId = 'nc-state' | 'unc' | 'app-state' | 'guild';

export type ShareGraphicTheme = {
  id: ShareGraphicThemeId;
  label: string;
  /** Background PNG in public/share-templates (without leading slash). */
  backgroundFile: string;
  firstNameColor: string;
  lastNameColor: string;
  sessionTypeColor: string;
  timeColor: string;
  timeBoxStroke: string;
  datePrimaryColor: string;
  dateSecondaryColor: string;
  facilityColor: string;
  footerLabelColor: string;
  footerValueColor: string;
  footerDivider: string;
};

function normalizeSchoolLabel(school: string): string {
  const s = school.trim();
  if (s === 'NCSU' || s === 'North Carolina State') return 'NC State';
  if (s === 'Appalachian State' || s === 'Appalachian State University') return 'App State';
  return s;
}

export const SHARE_GRAPHIC_THEMES: Record<ShareGraphicThemeId, ShareGraphicTheme> = {
  'nc-state': {
    id: 'nc-state',
    label: 'NC State',
    backgroundFile: 'share-templates/nc-state-feed.png',
    firstNameColor: '#FFFFFF',
    lastNameColor: '#CC0000',
    sessionTypeColor: '#FFFFFF',
    timeColor: '#FFFFFF',
    timeBoxStroke: '#CC0000',
    datePrimaryColor: '#CC0000',
    dateSecondaryColor: '#CCCCCC',
    facilityColor: '#CC0000',
    footerLabelColor: '#FFFFFF',
    footerValueColor: '#CC0000',
    footerDivider: '#333333',
  },
  unc: {
    id: 'unc',
    label: 'UNC',
    backgroundFile: 'share-templates/unc-feed.png',
    firstNameColor: '#FFFFFF',
    lastNameColor: '#4B9CD3',
    sessionTypeColor: '#FFFFFF',
    timeColor: '#FFFFFF',
    timeBoxStroke: '#4B9CD3',
    datePrimaryColor: '#4B9CD3',
    dateSecondaryColor: '#CCCCCC',
    facilityColor: '#4B9CD3',
    footerLabelColor: '#FFFFFF',
    footerValueColor: '#4B9CD3',
    footerDivider: '#13294B',
  },
  'app-state': {
    id: 'app-state',
    label: 'App State',
    backgroundFile: 'share-templates/app-state-feed.png',
    firstNameColor: '#FFFFFF',
    lastNameColor: '#FFCD00',
    sessionTypeColor: '#FFFFFF',
    timeColor: '#FFFFFF',
    timeBoxStroke: '#FFCD00',
    datePrimaryColor: '#FFCD00',
    dateSecondaryColor: '#CCCCCC',
    facilityColor: '#FFCD00',
    footerLabelColor: '#FFFFFF',
    footerValueColor: '#FFCD00',
    footerDivider: '#222222',
  },
  guild: {
    id: 'guild',
    label: 'The Guild',
    backgroundFile: 'share-templates/guild-feed.png',
    firstNameColor: '#FFFFFF',
    lastNameColor: '#B89D60',
    sessionTypeColor: '#B89D60',
    timeColor: '#B89D60',
    timeBoxStroke: '#B89D60',
    datePrimaryColor: '#B89D60',
    dateSecondaryColor: '#FFFFFF',
    facilityColor: '#FFFFFF',
    footerLabelColor: '#FFFFFF',
    footerValueColor: '#B89D60',
    footerDivider: '#333333',
  },
};

export const SHARE_GRAPHIC_THEME_IDS = Object.keys(SHARE_GRAPHIC_THEMES) as ShareGraphicThemeId[];

export function parseShareGraphicThemeId(value: string | null | undefined): ShareGraphicThemeId | null {
  if (!value) return null;
  return SHARE_GRAPHIC_THEME_IDS.includes(value as ShareGraphicThemeId)
    ? (value as ShareGraphicThemeId)
    : null;
}

/** Default skin from coach school; Guild when unknown or club. */
export function resolveShareGraphicTheme(
  school: string | null | undefined,
  override?: ShareGraphicThemeId | null
): ShareGraphicThemeId {
  if (override) return override;
  const label = normalizeSchoolLabel(school?.trim() || '');
  if (label === 'NC State') return 'nc-state';
  if (label === 'UNC') return 'unc';
  if (label === 'App State') return 'app-state';
  return 'guild';
}

export function getShareGraphicTheme(themeId: ShareGraphicThemeId): ShareGraphicTheme {
  return SHARE_GRAPHIC_THEMES[themeId];
}
