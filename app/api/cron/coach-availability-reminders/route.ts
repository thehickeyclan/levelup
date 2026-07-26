import { NextRequest, NextResponse } from 'next/server';
import { tenants } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';
import { parseNotificationPreferences } from '@/lib/notification-preferences';
import { resolveCoachSmsE164, sendSms } from '@/lib/twilio';

/**
 * Weekly nudge for active coaches who have no recurring availability template.
 * Coaches with any normal-week windows are left alone.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.wrestlingguild.com').replace(/\/$/, '');
  const link = '/availability';
  const byTenant: Record<string, { coachesWithoutHours: number; pushSent: number; smsSent: number }> = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    const [{ data: coaches }, { data: windows }] = await Promise.all([
      admin.from('athletes').select('id, first_name, last_name').eq('active', true),
      admin.from('athlete_availability').select('athlete_id'),
    ]);
    const withWindows = new Set((windows ?? []).map((row) => row.athlete_id as string));
    const missing = (coaches ?? []).filter((coach) => !withWindows.has(coach.id as string));
    const ids = missing.map((coach) => coach.id as string);
    const { data: users } = ids.length
      ? await admin.from('users').select('id, notification_preferences').in('id', ids)
      : { data: [] };
    const preferencesById = new Map(
      (users ?? []).map((user) => [user.id as string, parseNotificationPreferences(user.notification_preferences)])
    );

    let pushSent = 0;
    let smsSent = 0;
    for (const coach of missing) {
      const coachId = coach.id as string;
      const prefs = preferencesById.get(coachId) ?? parseNotificationPreferences(null);
      const firstName = String(coach.first_name ?? '').trim() || 'Coach';
      const body = 'Choose your usual weekly hours once. The Guild will repeat them so parents can book you.';

      if (prefs.reminders_push) {
        await createNotification(admin, {
          user_id: coachId,
          type: 'coach_availability_needed',
          title: `${firstName}, your calendar is empty`,
          body,
          data: { link, availability_setup: true },
        });
        pushSent += 1;
      }

      if (prefs.reminders_sms && !prefs.sms_opted_out) {
        const phone = await resolveCoachSmsE164(admin, coachId);
        if (phone) {
          const ok = await sendSms(
            phone,
            `The Guild: ${body} Set your normal week: ${appUrl}/availability`,
            {
              admin,
              messageType: 'coach_availability_needed',
              recipientId: coachId,
              recipientLabel: `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() || 'Coach',
              coachId,
            }
          );
          if (ok) smsSent += 1;
        }
      }
    }

    byTenant[slug] = {
      coachesWithoutHours: missing.length,
      pushSent,
      smsSent,
    };
  }

  return NextResponse.json({ ok: true, byTenant });
}
