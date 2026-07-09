import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSchoolLabel } from '@/lib/coaches-landing';
import {
  parseShareGraphicThemeId,
  resolveShareGraphicTheme,
  type ShareGraphicThemeId,
} from './themes';
import type { BuildSessionShareGraphicInput } from './build-session-share-graphic';

type SessionRow = {
  id: string;
  athlete_id: string;
  session_type: string | null;
  session_mode: string | null;
  scheduled_datetime: string;
  max_participants: number | null;
  price_per_participant: number | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
  athletes?: {
    first_name?: string | null;
    last_name?: string | null;
    school?: string | null;
    photo_url?: string | null;
  } | {
    first_name?: string | null;
    last_name?: string | null;
    school?: string | null;
    photo_url?: string | null;
  }[] | null;
};

function resolvePhotoUrl(photoUrl: string | null | undefined, appOrigin: string): string | null {
  if (!photoUrl?.trim()) return null;
  const u = photoUrl.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${appOrigin.replace(/\/$/, '')}${u}`;
  return u;
}

export async function fetchSessionShareGraphicInput(
  admin: SupabaseClient,
  sessionId: string,
  opts: { themeOverride?: string | null; appOrigin: string }
): Promise<{ input: BuildSessionShareGraphicInput; themeId: ShareGraphicThemeId } | null> {
  const { data: session, error } = await admin
    .from('sessions')
    .select(
      `
      id,
      athlete_id,
      session_type,
      session_mode,
      scheduled_datetime,
      max_participants,
      price_per_participant,
      facilities(name),
      athletes(first_name, last_name, school, photo_url)
    `
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) return null;

  const row = session as SessionRow;
  const athleteRow = row.athletes;
  const athlete = Array.isArray(athleteRow) ? athleteRow[0] : athleteRow;
  const facRow = row.facilities;
  const facility = Array.isArray(facRow) ? facRow[0] : facRow;
  const school = normalizeSchoolLabel(athlete?.school?.trim() || '');
  const themeOverride = parseShareGraphicThemeId(opts.themeOverride);
  const themeId = resolveShareGraphicTheme(school, themeOverride);

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
      coachPhotoUrl: resolvePhotoUrl(athlete?.photo_url, opts.appOrigin),
    },
  };
}
