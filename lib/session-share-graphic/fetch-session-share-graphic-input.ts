import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSchoolLabel } from '@/lib/coaches-landing';
import {
  parseShareGraphicThemeId,
  resolveShareGraphicTheme,
  type ShareGraphicThemeId,
} from './themes';
import type { BuildSessionShareGraphicInput } from './build-session-share-graphic';

type AthleteGraphicRow = {
  first_name?: string | null;
  last_name?: string | null;
  school?: string | null;
  photo_url?: string | null;
  photo_cutout_url?: string | null;
  photo_focus_x?: number | null;
  photo_focus_y?: number | null;
  share_photo_scale?: number | null;
  share_photo_offset_x?: number | null;
  share_photo_offset_y?: number | null;
};

type SessionRow = {
  id: string;
  athlete_id: string;
  session_type: string | null;
  session_mode: string | null;
  scheduled_datetime: string;
  max_participants: number | null;
  price_per_participant: number | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
  athletes?: AthleteGraphicRow | AthleteGraphicRow[] | null;
};

const SESSION_SELECT_WITH_CUTOUT = `
  id,
  athlete_id,
  session_type,
  session_mode,
  scheduled_datetime,
  max_participants,
  price_per_participant,
  facilities(name),
  athletes(first_name, last_name, school, photo_url, photo_cutout_url, photo_focus_x, photo_focus_y, share_photo_scale, share_photo_offset_x, share_photo_offset_y)
`;

const SESSION_SELECT_LEGACY = `
  id,
  athlete_id,
  session_type,
  session_mode,
  scheduled_datetime,
  max_participants,
  price_per_participant,
  facilities(name),
  athletes(first_name, last_name, school, photo_url, photo_focus_x, photo_focus_y)
`;

function resolvePhotoUrl(photoUrl: string | null | undefined, appOrigin: string): string | null {
  if (!photoUrl?.trim()) return null;
  const u = photoUrl.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${appOrigin.replace(/\/$/, '')}${u}`;
  return u;
}

async function loadSessionRow(
  admin: SupabaseClient,
  sessionId: string
): Promise<SessionRow | null> {
  const primary = await admin.from('sessions').select(SESSION_SELECT_WITH_CUTOUT).eq('id', sessionId).maybeSingle();
  if (!primary.error && primary.data) return primary.data as SessionRow;

  const msg = primary.error?.message ?? '';
  if (/photo_cutout_url|share_photo_scale|column.*does not exist/i.test(msg)) {
    const legacy = await admin.from('sessions').select(SESSION_SELECT_LEGACY).eq('id', sessionId).maybeSingle();
    if (!legacy.error && legacy.data) return legacy.data as SessionRow;
  }

  if (primary.error) {
    console.warn('[fetchSessionShareGraphicInput] session load:', primary.error.message);
  }
  return null;
}

export async function fetchSessionShareGraphicInput(
  admin: SupabaseClient,
  sessionId: string,
  opts: { themeOverride?: string | null; appOrigin: string }
): Promise<{ input: BuildSessionShareGraphicInput; themeId: ShareGraphicThemeId } | null> {
  const row = await loadSessionRow(admin, sessionId);
  if (!row) return null;

  const athleteRow = row.athletes;
  const athlete = Array.isArray(athleteRow) ? athleteRow[0] : athleteRow;
  const facRow = row.facilities;
  const facility = Array.isArray(facRow) ? facRow[0] : facRow;
  const school = normalizeSchoolLabel(athlete?.school?.trim() || '');
  const themeOverride = parseShareGraphicThemeId(opts.themeOverride);
  const themeId = resolveShareGraphicTheme(school, themeOverride);

  const photoUrl = resolvePhotoUrl(athlete?.photo_url, opts.appOrigin);
  const cutoutUrl = resolvePhotoUrl(athlete?.photo_cutout_url, opts.appOrigin);

  return {
    themeId,
    input: {
      themeId,
      firstName: athlete?.first_name?.trim() || 'Coach',
      lastName: athlete?.last_name?.trim() || '',
      schoolLabel: school || 'The Guild',
      sessionType: row.session_type,
      sessionMode: row.session_mode,
      scheduledDatetime: row.scheduled_datetime,
      facilityName: facility?.name?.trim() || 'TBD',
      maxParticipants: Number(row.max_participants) || 6,
      pricePerParticipant:
        row.price_per_participant != null ? Number(row.price_per_participant) : null,
      coachPhotoUrl: photoUrl,
      coachPhotoCutoutUrl: cutoutUrl,
      photoFocusX: athlete?.photo_focus_x ?? 50,
      photoFocusY: athlete?.photo_focus_y ?? 15,
      sharePhotoScale: athlete?.share_photo_scale ?? 100,
      sharePhotoOffsetX: athlete?.share_photo_offset_x ?? 0,
      sharePhotoOffsetY: athlete?.share_photo_offset_y ?? 0,
      coachAthleteId: row.athlete_id,
    },
  };
}
