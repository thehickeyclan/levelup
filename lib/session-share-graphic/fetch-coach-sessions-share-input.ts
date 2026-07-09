import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSchoolLabel } from '@/lib/coaches-landing';
import {
  parseShareGraphicThemeId,
  resolveShareGraphicTheme,
  type ShareGraphicThemeId,
} from './themes';
import type { BuildCoachSessionsShareGraphicInput } from './build-session-share-graphic';
import {
  buildShareGraphicSessionSlots,
  shareGraphicDateRangeLabel,
  shareGraphicDayHeader,
  shareGraphicPrimaryFacility,
} from './share-graphic-session-slots';

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
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  max_participants?: number | null;
  current_participants?: number | null;
  join_policy?: string | null;
  session_participants?: unknown[] | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
};

const ATHLETE_SELECT_WITH_CUTOUT = `
  first_name,
  last_name,
  school,
  photo_url,
  photo_cutout_url,
  photo_focus_x,
  photo_focus_y,
  share_photo_scale,
  share_photo_offset_x,
  share_photo_offset_y
`;

const ATHLETE_SELECT_LEGACY = `
  first_name,
  last_name,
  school,
  photo_url,
  photo_focus_x,
  photo_focus_y
`;

const SESSION_SELECT = `
  id,
  scheduled_datetime,
  session_type,
  session_mode,
  max_participants,
  current_participants,
  join_policy,
  facilities(name),
  session_participants(id)
`;

function resolvePhotoUrl(photoUrl: string | null | undefined, appOrigin: string): string | null {
  if (!photoUrl?.trim()) return null;
  const u = photoUrl.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${appOrigin.replace(/\/$/, '')}${u}`;
  return u;
}

async function loadAthleteRow(
  admin: SupabaseClient,
  coachId: string
): Promise<AthleteGraphicRow | null> {
  const primary = await admin.from('athletes').select(ATHLETE_SELECT_WITH_CUTOUT).eq('id', coachId).maybeSingle();
  if (!primary.error && primary.data) return primary.data as AthleteGraphicRow;

  const msg = primary.error?.message ?? '';
  if (/photo_cutout_url|share_photo_scale|column.*does not exist/i.test(msg)) {
    const legacy = await admin.from('athletes').select(ATHLETE_SELECT_LEGACY).eq('id', coachId).maybeSingle();
    if (!legacy.error && legacy.data) return legacy.data as AthleteGraphicRow;
  }

  if (primary.error) {
    console.warn('[fetchCoachSessionsShareGraphicInput] athlete load:', primary.error.message);
  }
  return null;
}

export async function fetchCoachSessionsShareGraphicInput(
  admin: SupabaseClient,
  coachId: string,
  opts: { themeOverride?: string | null; appOrigin: string }
): Promise<{ input: BuildCoachSessionsShareGraphicInput; themeId: ShareGraphicThemeId } | null> {
  const athlete = await loadAthleteRow(admin, coachId);
  if (!athlete) return null;

  const now = new Date().toISOString();
  const { data: sessionRows } = await admin
    .from('sessions')
    .select(SESSION_SELECT)
    .eq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', now)
    .order('scheduled_datetime', { ascending: true })
    .limit(24);

  const sessions = (sessionRows ?? []) as SessionRow[];
  const school = normalizeSchoolLabel(athlete.school?.trim() || '');
  const themeOverride = parseShareGraphicThemeId(opts.themeOverride);
  const themeId = resolveShareGraphicTheme(school, themeOverride);

  const { slots, overflowCount } = buildShareGraphicSessionSlots(sessions, { maxSlots: 4 });
  const dayHeader = shareGraphicDayHeader(sessions);
  const dateRange = shareGraphicDateRangeLabel(sessions);
  const facilityLine = shareGraphicPrimaryFacility(sessions, school || 'The Guild');

  const photoUrl = resolvePhotoUrl(athlete.photo_url, opts.appOrigin);
  const cutoutUrl = resolvePhotoUrl(athlete.photo_cutout_url, opts.appOrigin);

  return {
    themeId,
    input: {
      themeId,
      coachId,
      appOrigin: opts.appOrigin,
      firstName: athlete.first_name?.trim() || 'Coach',
      lastName: athlete.last_name?.trim() || '',
      schoolLabel: school || 'The Guild',
      dateDayLabel: dayHeader,
      dateRestLabel: dateRange,
      facilityLine,
      sessionSlots: slots,
      overflowCount,
      coachPhotoUrl: photoUrl,
      coachPhotoCutoutUrl: cutoutUrl,
      photoFocusX: athlete.photo_focus_x ?? 50,
      photoFocusY: athlete.photo_focus_y ?? 15,
      sharePhotoScale: athlete.share_photo_scale ?? 100,
      sharePhotoOffsetX: athlete.share_photo_offset_x ?? 0,
      sharePhotoOffsetY: athlete.share_photo_offset_y ?? 0,
      coachAthleteId: coachId,
    },
  };
}
