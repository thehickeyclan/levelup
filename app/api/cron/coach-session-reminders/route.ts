import { NextRequest, NextResponse } from 'next/server';
import { tenants } from '@/config/tenants';
import {
  buildCoachOneHourReminderBody,
  COACH_REMINDER_WINDOW_MAX_MINUTES,
  COACH_REMINDER_WINDOW_MIN_MINUTES,
} from '@/lib/coach-session-reminder';
import { logMessage } from '@/lib/message-log';
import { createNotification } from '@/lib/notifications';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCoachSmsE164, sendSms } from '@/lib/twilio';

type ReminderSessionRow = {
  id: string;
  athlete_id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  duration_minutes?: number | null;
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
    { sent: number; closeoutSent: number; missingPhone: number; failed: number }
  > = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    let sent = 0;
    let closeoutSent = 0;
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
      byTenant[slug] = { sent, closeoutSent, missingPhone, failed: failed + 1 };
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

    // The same five-minute job also creates one in-app/push reminder after the
    // scheduled end. Notification data is the idempotency key, so an unclosed
    // session never spams the coach on later cron runs.
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const { data: closeoutRows, error: closeoutError } = await admin
      .from('sessions')
      .select(
        'id, athlete_id, scheduled_datetime, duration_minutes, session_type, session_mode, athletes(first_name, last_name), facilities(name)'
      )
      .eq('status', 'scheduled')
      .gte('scheduled_datetime', oneDayAgo)
      .lte('scheduled_datetime', now.toISOString())
      .limit(200);

    if (closeoutError) {
      console.error(`coach closeout reminder query ${slug}`, closeoutError);
      failed++;
    } else {
      for (const row of (closeoutRows ?? []) as ReminderSessionRow[]) {
        const endsAt =
          new Date(row.scheduled_datetime).getTime() + (row.duration_minutes ?? 60) * 60_000;
        if (endsAt > now.getTime()) continue;

        const { data: existing } = await admin
          .from('notifications')
          .select('id')
          .eq('user_id', row.athlete_id)
          .eq('type', 'coach_session_closeout')
          .contains('data', { session_id: row.id })
          .limit(1)
          .maybeSingle();
        if (existing) continue;

        const facility = firstRelation(row.facilities);
        await createNotification(admin, {
          user_id: row.athlete_id,
          type: 'coach_session_closeout',
          title: 'Close out your session',
          body: `Record attendance${facility?.name ? ` at ${facility.name}` : ''}, or reschedule/cancel if it did not happen.`,
          data: {
            session_id: row.id,
            deep_link: `/coach-session-closeout/${row.id}`,
          },
          sessionId: row.id,
          coachId: row.athlete_id,
        });
        closeoutSent++;
      }
    }

    byTenant[slug] = { sent, closeoutSent, missingPhone, failed };
  }

  return NextResponse.json({ ok: true, windowStart, windowEnd, byTenant });
}
