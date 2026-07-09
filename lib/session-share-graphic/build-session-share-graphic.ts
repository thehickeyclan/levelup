import sharp, { type OverlayOptions } from 'sharp';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import {
  getShareGraphicTheme,
  type ShareGraphicThemeId,
} from './themes';
import { shareGraphicBackgroundPath } from './themes-server';
import {
  buildLeftScrimSvg,
  buildTextOverlaySvg,
  truncateUpper,
  type SessionShareGraphicContent,
} from './build-overlay-svg';

export const SHARE_GRAPHIC_WIDTH = 1080;
export const SHARE_GRAPHIC_HEIGHT = 1440;

export type BuildSessionShareGraphicInput = {
  themeId: ShareGraphicThemeId;
  firstName: string;
  lastName: string;
  schoolLabel: string;
  sessionType: string | null;
  sessionMode: string | null;
  scheduledDatetime: string;
  facilityName: string;
  maxParticipants: number;
  pricePerParticipant: number | null;
  coachPhotoUrl: string | null;
};

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

async function generateFallbackBackground(themeId: ShareGraphicThemeId): Promise<Buffer> {
  const theme = getShareGraphicTheme(themeId);
  const accent = theme.lastNameColor;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_GRAPHIC_WIDTH}" height="${SHARE_GRAPHIC_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="${SHARE_GRAPHIC_HEIGHT - 132}" width="${SHARE_GRAPHIC_WIDTH}" height="132" fill="#000"/>
  <path d="M0,200 L${SHARE_GRAPHIC_WIDTH},400" stroke="${accent}" stroke-width="6" opacity="0.25"/>
  <path d="M0,800 L${SHARE_GRAPHIC_WIDTH},600" stroke="${accent}" stroke-width="4" opacity="0.18"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function sessionTypeKey(
  sessionType: string | null,
  sessionMode: string | null
): 'small_group' | 'partner' | 'private' {
  if (sessionType === 'group' || sessionType === 'small_group') return 'small_group';
  if (sessionType === '2-athlete' || sessionType === 'partner') return 'partner';
  if (sessionType === '1-on-1' || sessionType === 'private') return 'private';
  if (sessionMode === 'partner-open' || sessionMode === 'partner-invite') return 'partner';
  return 'private';
}

function buildContent(input: BuildSessionShareGraphicInput): SessionShareGraphicContent {
  const typeKey = sessionTypeKey(input.sessionType, input.sessionMode);
  const typeDisplay = getSessionTypeDisplay(input.sessionType, input.sessionMode);
  const dt = new Date(input.scheduledDatetime);
  const day = formatEST(dt, 'EEEE').toUpperCase();
  const dateRest = formatEST(dt, 'MMMM d, yyyy').toUpperCase();
  const time = formatEST(dt, 'h:mm a').toUpperCase();

  const facilityShort = truncateUpper(input.facilityName.replace(/\s+/g, ' '), 42);
  const schoolShort = truncateUpper(input.schoolLabel, 18);
  const coachName = truncateUpper(`${input.firstName} ${input.lastName}`.trim(), 22);

  let footerLeftTitle = typeDisplay.label.toUpperCase();
  let footerLeftValue = '';
  if (typeKey === 'small_group') {
    footerLeftValue = `LIMITED TO ${input.maxParticipants} WRESTLERS`;
  } else if (typeKey === 'partner') {
    footerLeftValue = 'LIMITED TO 2 WRESTLERS';
  } else {
    footerLeftValue = '1-ON-1 SESSION';
  }

  const facilityFooter = truncateUpper(input.facilityName.split(/\s+/).slice(-2).join(' ') || input.facilityName, 22);

  return {
    firstName: truncateUpper(input.firstName, 14),
    lastName: truncateUpper(input.lastName, 16),
    sessionTypeLabel: typeDisplay.label.toUpperCase(),
    timeLabel: time,
    dateDayLabel: day,
    dateRestLabel: dateRest,
    facilityLine: `AT ${facilityShort}`,
    footerLeftTitle,
    footerLeftValue: truncateUpper(footerLeftValue, 28),
    footerCenterTitle: coachName,
    footerCenterValue: schoolShort,
    footerRightTitle: schoolShort,
    footerRightValue: truncateUpper(facilityFooter, 22),
  };
}

export async function buildSessionShareGraphic(input: BuildSessionShareGraphicInput): Promise<Buffer> {
  const theme = getShareGraphicTheme(input.themeId);
  const bgPath = shareGraphicBackgroundPath(input.themeId);
  const bgBuffer = bgPath
    ? await sharp(bgPath).resize(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT, { fit: 'cover' }).png().toBuffer()
    : await generateFallbackBackground(input.themeId);

  const overlays: OverlayOptions[] = [];

  if (input.coachPhotoUrl) {
    const photoBuf = await fetchImageBuffer(input.coachPhotoUrl);
    if (photoBuf) {
      const photo = await sharp(photoBuf)
        .resize(520, 1080, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      overlays.push({ input: photo, top: 200, left: 548, blend: 'over' });
    }
  }

  overlays.push({
    input: Buffer.from(buildLeftScrimSvg(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT)),
    top: 0,
    left: 0,
  });

  const content = buildContent(input);
  overlays.push({
    input: Buffer.from(buildTextOverlaySvg(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT, theme, content)),
    top: 0,
    left: 0,
  });

  return sharp(bgBuffer).composite(overlays).png().toBuffer();
}
