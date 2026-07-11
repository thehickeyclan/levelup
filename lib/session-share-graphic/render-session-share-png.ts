import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCoachPhotoCutout, getRemoveBgApiKey } from '@/lib/coach-photo-cutout';
import { buildSessionShareGraphic } from '@/lib/session-share-graphic/build-session-share-graphic';
import { fetchSessionShareGraphicInput } from '@/lib/session-share-graphic/fetch-session-share-graphic-input';
import { shareGraphicBookingUrl } from '@/lib/session-share-graphic/share-graphic-session-slots';

export async function renderSessionSharePng(
  admin: SupabaseClient,
  sessionId: string,
  opts: { appOrigin: string; themeOverride?: string | null }
): Promise<Uint8Array | null> {
  const { data: session } = await admin
    .from('sessions')
    .select('id, athlete_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return null;

  const payload = await fetchSessionShareGraphicInput(admin, sessionId, {
    themeOverride: opts.themeOverride,
    appOrigin: opts.appOrigin,
  });
  if (!payload) return null;

  let cutoutUrl = payload.input.coachPhotoCutoutUrl ?? null;
  if (payload.input.coachPhotoUrl && session.athlete_id && getRemoveBgApiKey()) {
    cutoutUrl =
      (await ensureCoachPhotoCutout(
        admin,
        session.athlete_id as string,
        payload.input.coachPhotoUrl,
        cutoutUrl
      )) ?? cutoutUrl;
  }

  const bookingUrl = shareGraphicBookingUrl(opts.appOrigin, session.athlete_id as string);

  return buildSessionShareGraphic({
    ...payload.input,
    appOrigin: opts.appOrigin,
    bookingUrl,
    coachPhotoCutoutUrl: cutoutUrl,
    photoAdmin: admin,
  });
}
