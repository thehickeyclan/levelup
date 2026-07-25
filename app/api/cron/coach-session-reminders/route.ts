import { NextRequest, NextResponse } from 'next/server';
import { tenants } from '@/config/tenants';
import {
  buildCoachOneHourReminderBody,
  COACH_REMINDER_WINDOW_MAX_MINUTES,
  COACH_REMINDER_WINDOW_MIN_MINUTES,
} from '@/lib/coach-session-reminder';
import { logMessage } from '@/lib/message-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCoachSmsE164, sendSms } from '@/lib/twilio';

type ReminderSessionRow = {
  id: string;
  athlete_id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  athletes:
    | { first_name?: string | null; last_name?: string | null }
    | Array<{ first_name?: string | null; last_name?: string | null }>
    | null;
  facilities:
    | { name?: string | null }
    | Array<{ name?: string | null }>
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Every five minutes, text the assigned coach roughly one hour before their session.
 * The only recipient is `sessions.athlete_id`; this route never broadcasts to other coaches.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(
    now.getTime() + COACH_REMINDER_WINDOW_MIN_MINUTES * 60_000
  ).toISOString();
  const windowEnd = new Date(
    now.getTime() + COACH_REMINDER_WINDOW_MAX_MINUTES * 60_000
  ).toISOString();
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || 'https://www.wrestlingguild.com'
  ).replace(/\/$/, '');

  const byTenant: Record<
    string,
    { sent: number; missingPhone: number; failed: number }
  > = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    let sent = 0;
    let missingPhone = 0;
    let failed = 0;

    const { data, error } = await admin
      .from('sessions')
      .select(
        'id, athlete_id, scheduled_datetime, session_type, session_mode, athletes(first_name, last_name), facilities(name)'
      )
      .eq('status', 'scheduled')
      .is('coach_one_hour_reminder_sent_at', null)
      .gte('scheduled_datetime', windowStart)
      .lte('scheduled_datetime', windowEnd)
      .limit(200);

    if (error) {
      console.error(`coach-session-reminders query ${slug}`, error);
      byTenant[slug] = { sent, missingPhone, failed: failed + 1 };
      continue;
    }

    for (const row of (data ?? []) as ReminderSessionRow[]) {
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await admin
        .from('sessions')
        .update({ coach_one_hour_reminder_sent_at: claimedAt })
        .eq('id', row.id)
        .is('coach_one_hour_reminder_sent_at', null)
        .select('id')
        .maybeSingle();
      if (claimError || !claimed) continue;

      const coach = firstRelation(row.athletes);
      const coachName =
        [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim() ||
        'Coach';
      const facility = firstRelation(row.facilities);
      const phone = await resolveCoachSmsE164(admin, row.athlete_id);
      const sessionUrl = `${appUrl}/athlete-dashboard?session=${encodeURIComponent(row.id)}`;
      const body = buildCoachOneHourReminderBody({
        scheduledDatetime: row.scheduled_datetime,
        sessionType: row.session_type,
        sessionMode: row.session_mode,
        facilityName: facility?.name,
        sessionUrl,
      });

      if (!phone) {
        await logMessage(admin, {
          channel: 'sms',
          recipientId: row.athlete_id,
          recipientLabel: coachName,
          messageType: 'coach_session_one_hour_reminder',
          body,
          sessionId: row.id,
          coachId: row.athlete_id,
          status: 'failed',
          errorDetail: 'Coach has no valid SMS phone number on file.',
        });
        missingPhone++;
        continue;
      }

      const ok = await sendSms(phone, body, {
        admin,
        messageType: 'coach_session_one_hour_reminder',
        recipientId: row.athlete_id,
        recipientLabel: coachName,
        sessionId: row.id,
        coachId: row.athlete_id,
      });
      if (ok) {
        sent++;
      } else {
        // Allow a later five-minute cron attempt while the session remains in the window.
        await admin
          .from('sessions')
          .update({ coach_one_hour_reminder_sent_at: null })
          .eq('id', row.id)
          .eq('coach_one_hour_reminder_sent_at', claimedAt);
        failed++;
      }
    }

    byTenant[slug] = { sent, missingPhone, failed };
  }

  return NextResponse.json({ ok: true, windowStart, windowEnd, byTenant });
}
