import QRCode from 'qrcode';
import sharp, { type OverlayOptions } from 'sharp';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import {
  getShareGraphicTheme,
  type ShareGraphicThemeId,
} from './themes';
import { shareGraphicBackgroundPath } from './themes-server';
import {
  buildCoachShareTextOverlaySvg,
  buildLeftScrimSvg,
  buildTextOverlaySvg,
  truncateUpper,
  type CoachShareGraphicContent,
  type SessionShareGraphicContent,
} from './build-overlay-svg';
import type { ShareGraphicSessionSlot } from './share-graphic-session-slots';
import {
  formatShareGraphicBookingLine,
  shareGraphicBookingUrl,
} from './share-graphic-session-slots';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCoachPhotoOverlay } from './build-coach-photo-overlay';
import { rasterizeShareOverlaySvg } from './rasterize-overlay-svg';
import { fetchCoachImageBuffer } from './fetch-coach-image-buffer';

export const SHARE_GRAPHIC_WIDTH = 1080;
export const SHARE_GRAPHIC_HEIGHT = 1440;

export type BuildCoachSessionsShareGraphicInput = {
  themeId: ShareGraphicThemeId;
  coachId: string;
  appOrigin: string;
  firstName: string;
  lastName: string;
  schoolLabel: string;
  dateDayLabel: string;
  dateRestLabel: string;
  facilityLine: string;
  sessionSlots: ShareGraphicSessionSlot[];
  overflowCount: number;
  coachPhotoUrl: string | null;
  coachPhotoCutoutUrl?: string | null;
  photoFocusX?: number;
  photoFocusY?: number;
  sharePhotoScale?: number;
  sharePhotoOffsetX?: number;
  sharePhotoOffsetY?: number;
  photoAdmin?: SupabaseClient;
  coachAthleteId?: string | null;
};

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
  coachPhotoCutoutUrl?: string | null;
  photoFocusX?: number;
  photoFocusY?: number;
  sharePhotoScale?: number;
  sharePhotoOffsetX?: number;
  sharePhotoOffsetY?: number;
  /** Supabase admin — loads coach photos from storage (reliable on Vercel serverless). */
  photoAdmin?: SupabaseClient;
  coachAthleteId?: string | null;
  appOrigin?: string;
  /** Coach schedule URL — QR always targets /coach/[id]. */
  bookingUrl?: string | null;
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

  const facilityShort = truncateUpper(input.facilityName.replace(/\s+/g, ' '), 36);
  const schoolShort = truncateUpper(input.schoolLabel, 18);
  const coachName = truncateUpper(`${input.firstName} ${input.lastName}`.trim(), 22);

  let footerLeftTitle = typeDisplay.label.toUpperCase();
  let sessionStatusLabel = typeDisplay.label.toUpperCase();
  let footerLeftValue = '';
  if (typeKey === 'small_group') {
    footerLeftValue = `LIMITED TO ${input.maxParticipants} WRESTLERS`;
    sessionStatusLabel = `${input.maxParticipants} SPOTS`;
  } else if (typeKey === 'partner') {
    footerLeftValue = 'LIMITED TO 2 WRESTLERS';
    sessionStatusLabel = '2 SPOTS';
  } else {
    footerLeftValue = '1-ON-1 SESSION';
    sessionStatusLabel = 'PRIVATE';
  }

  const facilityFooter = truncateUpper(input.facilityName.split(/\s+/).slice(-2).join(' ') || input.facilityName, 22);
  const facilityLine =
    schoolShort && !facilityShort.toUpperCase().includes(schoolShort)
      ? `${schoolShort} ${facilityShort}`
      : facilityShort;

  const bookingLine = input.appOrigin
    ? formatShareGraphicBookingLine(input.appOrigin, input.coachAthleteId ?? '')
    : undefined;

  return {
    firstName: truncateUpper(input.firstName, 14),
    lastName: truncateUpper(input.lastName, 16),
    schoolLabel: schoolShort,
    sessionTypeLabel: typeDisplay.label.toUpperCase(),
    sessionStatusLabel: truncateUpper(sessionStatusLabel, 14),
    timeLabel: time,
    dateDayLabel: day,
    dateRestLabel: dateRest,
    facilityLine: truncateUpper(facilityLine, 42),
    footerLeftTitle,
    footerLeftValue: truncateUpper(footerLeftValue, 28),
    footerCenterTitle: coachName,
    footerCenterValue: schoolShort,
    footerRightTitle: schoolShort,
    footerRightValue: truncateUpper(facilityFooter, 22),
    bookingLine,
    bookingSubline: bookingLine ? 'ALL UPCOMING SESSIONS' : undefined,
  };
}

const SHARE_GRAPHIC_QR_SIZE = 168;
const SHARE_GRAPHIC_QR_MARGIN = 44;

async function buildBookingQrOverlay(bookingUrl: string): Promise<OverlayOptions | null> {
  try {
    const qrBuffer = await QRCode.toBuffer(bookingUrl, {
      width: SHARE_GRAPHIC_QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
      type: 'png',
    });
    const pad = 10;
    const frameSize = SHARE_GRAPHIC_QR_SIZE + pad * 2;
    const framed = await sharp(qrBuffer)
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: '#ffffff',
      })
      .png()
      .toBuffer();

    return {
      input: framed,
      top: SHARE_GRAPHIC_HEIGHT - frameSize - SHARE_GRAPHIC_QR_MARGIN,
      left: SHARE_GRAPHIC_WIDTH - frameSize - SHARE_GRAPHIC_QR_MARGIN,
    };
  } catch (err) {
    console.warn('[buildShareGraphic] QR overlay failed:', err);
    return null;
  }
}

async function compositeShareGraphicLayers(
  themeId: ShareGraphicThemeId,
  photoInput: Pick<
    BuildSessionShareGraphicInput,
    | 'coachPhotoUrl'
    | 'coachPhotoCutoutUrl'
    | 'photoFocusX'
    | 'photoFocusY'
    | 'sharePhotoScale'
    | 'sharePhotoOffsetX'
    | 'sharePhotoOffsetY'
    | 'photoAdmin'
    | 'coachAthleteId'
  >,
  textSvg: string,
  opts?: { bookingUrl?: string | null }
): Promise<Buffer> {
  const theme = getShareGraphicTheme(themeId);
  const bgPath = shareGraphicBackgroundPath(themeId);
  const bgBuffer = bgPath
    ? await sharp(bgPath).resize(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT, { fit: 'cover' }).png().toBuffer()
    : await generateFallbackBackground(themeId);

  const overlays: OverlayOptions[] = [];

  const loadPhoto = async (url: string) => {
    if (photoInput.photoAdmin) {
      return fetchCoachImageBuffer(photoInput.photoAdmin, url, photoInput.coachAthleteId);
    }
    return fetchImageBuffer(url);
  };

  const photoOverlay = await buildCoachPhotoOverlay({
    cutoutUrl: photoInput.coachPhotoCutoutUrl ?? null,
    photoUrl: photoInput.coachPhotoUrl,
    photoFocusX: photoInput.photoFocusX ?? 50,
    photoFocusY: photoInput.photoFocusY ?? 15,
    sharePhotoScale: photoInput.sharePhotoScale,
    sharePhotoOffsetX: photoInput.sharePhotoOffsetX,
    sharePhotoOffsetY: photoInput.sharePhotoOffsetY,
    fetchImage: loadPhoto,
  }).catch((err) => {
    console.warn('[buildSessionShareGraphic] coach photo overlay failed:', err);
    return null;
  });
  if (photoOverlay) overlays.push(photoOverlay);

  overlays.push({
    input: Buffer.from(buildLeftScrimSvg(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT)),
    top: 0,
    left: 0,
  });

  const textOverlayPng = rasterizeShareOverlaySvg(textSvg);
  overlays.push({
    input: textOverlayPng,
    top: 0,
    left: 0,
  });

  if (opts?.bookingUrl) {
    const qrOverlay = await buildBookingQrOverlay(opts.bookingUrl);
    if (qrOverlay) overlays.push(qrOverlay);
  }

  return sharp(bgBuffer).composite(overlays).png().toBuffer();
}

function buildCoachSessionsContent(input: BuildCoachSessionsShareGraphicInput): CoachShareGraphicContent {
  const schoolShort = truncateUpper(input.schoolLabel, 18);
  return {
    firstName: truncateUpper(input.firstName, 14),
    lastName: truncateUpper(input.lastName, 16),
    schoolLabel: schoolShort,
    dateDayLabel: truncateUpper(input.dateDayLabel, 24),
    dateRestLabel: truncateUpper(input.dateRestLabel, 42),
    facilityLine: truncateUpper(input.facilityLine, 42),
    bookingLine: formatShareGraphicBookingLine(input.appOrigin, input.coachId),
    sessionSlots: input.sessionSlots,
    overflowCount: input.overflowCount,
  };
}

export async function buildCoachSessionsShareGraphic(
  input: BuildCoachSessionsShareGraphicInput
): Promise<Buffer> {
  const theme = getShareGraphicTheme(input.themeId);
  const content = buildCoachSessionsContent(input);
  const textSvg = buildCoachShareTextOverlaySvg(
    SHARE_GRAPHIC_WIDTH,
    SHARE_GRAPHIC_HEIGHT,
    theme,
    content
  );
  const bookingUrl = shareGraphicBookingUrl(input.appOrigin, input.coachId);
  return compositeShareGraphicLayers(input.themeId, input, textSvg, { bookingUrl });
}

export async function buildSessionShareGraphic(input: BuildSessionShareGraphicInput): Promise<Buffer> {
  const theme = getShareGraphicTheme(input.themeId);
  const content = buildContent(input);
  const textSvg = buildTextOverlaySvg(SHARE_GRAPHIC_WIDTH, SHARE_GRAPHIC_HEIGHT, theme, content);
  return compositeShareGraphicLayers(input.themeId, input, textSvg, {
    bookingUrl: input.bookingUrl ?? null,
  });
}
