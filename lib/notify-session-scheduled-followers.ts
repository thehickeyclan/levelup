import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';
import { normalizePhone, sendSms } from '@/lib/twilio';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import {
  parseNotificationPreferences,
  wantsNewSessionPush,
  wantsNewSessionSms,
} from '@/lib/notification-preferences';

export type NotifySessionFollowersResult = {
  inAppSent: number;
  smsSent: number;
};

type SessionRow = {
  id: string;
  athlete_id: string;
  status: string;
  join_policy: string | null;
  session_type: string | null;
  session_mode: string | null;
  scheduled_datetime: string;
  max_participants: number | null;
  current_participants: number | null;
  price_per_participant: number | null;
  partner_invite_code: string | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
  athletes?: { first_name?: string | null; last_name?: string | null; school?: string | null } | { first_name?: string | null; last_name?: string | null; school?: string | null }[] | null;
};

function sessionLinkPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}

function publicAppHost(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://wrestlingguild.com').replace(/\/$/, '');
  try {
    return new URL(base).host;
  } catch {
    return 'wrestlingguild.com';
  }
}

/** Build follower SMS body per spec (Eastern time, session detail deep link, STOP footer). */
export function buildNewSessionSmsBody(session: SessionRow, coachName: string, programName?: string | null): string {
  const { label: sessionType } = getSessionTypeDisplay(session.session_type, session.session_mode);
  const when = formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d · h:mm a');
  const facRow = session.facilities;
  const facOne = Array.isArray(facRow) ? facRow[0] : facRow;
  const facilityName = facOne?.name?.trim() || 'TBD';
  const max = Number(session.max_participants) || 0;
  const current = Number(session.current_participants) || 0;
  const spots = Math.max(0, max - current);
  const price = Number(session.price_per_participant) || 0;
  const host = publicAppHost();
  const link = `${host}/sessions/${session.id}`;

  const coachLine = programName?.trim()
    ? `New session from ${coachName} · ${programName.trim()}`
    : `New session from ${coachName}`;

  const lines = [
    coachLine,
    `${sessionType} · ${when} ET`,
    `${facilityName} · ${spots} spot${spots === 1 ? '' : 's'} · $${price}`,
    `Book now: ${link}`,
    '',
    'Reply STOP to unsubscribe',
  ];
  return lines.join('\n').slice(0, 1600);
}

/** True when follower SMS/in-app new-session alerts may fire for this session. */
export function isSessionAlertable(joinPolicy: string | null | undefined, status: string | null | undefined): boolean {
  return status === 'scheduled' && joinPolicy === 'public';
}

/**
 * Notify parents who follow this coach: in-app notification + SMS (if enabled).
 * Idempotent per parent/session via session_sms_alerts. Skips invite-only, private,
 * already-booked parents, and those who opted out of SMS.
 */
export async function notifySessionScheduledFollowers(
  tenantSlug: string,
  coachId: string,
  opts: {
    sessionId: string;
    scheduledDatetime?: string;
    /** @deprecated SMS uses /sessions/[id]; kept for callers that still pass join path */
    joinUrlPath?: string;
  }
): Promise<NotifySessionFollowersResult> {
  const result: NotifySessionFollowersResult = { inAppSent: 0, smsSent: 0 };
  try {
    const admin = createAdminClient(tenantSlug);

    const { data: session, error: sessionErr } = await admin
      .from('sessions')
      .select(
        `
        id,
        athlete_id,
        status,
        join_policy,
        session_type,
        session_mode,
        scheduled_datetime,
        max_participants,
        current_participants,
        price_per_participant,
        partner_invite_code,
        facilities(name),
        athletes(first_name, last_name, school)
      `
      )
      .eq('id', opts.sessionId)
      .maybeSingle();

    if (sessionErr || !session) return result;
    const row = session as SessionRow;
    if (!isSessionAlertable(row.join_policy, row.status)) return result;
    if (row.athlete_id !== coachId) return result;

    const athleteRow = row.athletes;
    const coachOne = Array.isArray(athleteRow) ? athleteRow[0] : athleteRow;
    const coachName = coachOne
      ? `${coachOne.first_name ?? ''} ${coachOne.last_name ?? ''}`.trim()
      : 'A coach you follow';
    const programName = coachOne?.school?.trim() || null;

    const { data: follows } = await admin
      .from('coach_follows')
      .select('parent_id')
      .eq('coach_id', coachId);
    if (!follows?.length) return result;

    const parentIds = [...new Set(follows.map((f) => f.parent_id))];

    const [{ data: parentsRaw, error: parentsErr }, { data: booked }, { data: alreadySent, error: alertsErr }] =
      await Promise.all([
        admin.from('users').select('id, phone, notification_preferences').in('id', parentIds),
        admin.from('session_participants').select('parent_id').eq('session_id', opts.sessionId),
        admin.from('session_sms_alerts').select('parent_id').eq('session_id', opts.sessionId),
      ]);

    let parents = parentsRaw;
    if (parentsErr) {
      const missingPrefs =
        /notification_preferences/i.test(parentsErr.message) ||
        /column.*does not exist/i.test(parentsErr.message);
      if (missingPrefs) {
        console.warn(
          'notifySessionScheduledFollowers: notification_preferences missing — apply migration 20260631120000; using defaults'
        );
        const { data: fallback } = await admin.from('users').select('id, phone').in('id', parentIds);
        parents = (fallback ?? []).map((p) => ({ ...p, notification_preferences: null }));
      } else {
        console.warn('notifySessionScheduledFollowers: users lookup failed:', parentsErr.message);
        return result;
      }
    }

    if (alertsErr && /session_sms_alerts/i.test(alertsErr.message)) {
      console.warn(
        'notifySessionScheduledFollowers: session_sms_alerts missing — apply migration 20260631120000; idempotency disabled'
      );
    }

    const bookedSet = new Set((booked ?? []).map((r) => r.parent_id));
    const alertedSet = new Set((alreadySent ?? []).map((r) => r.parent_id));

    const when = formatEST(
      new Date(opts.scheduledDatetime ?? row.scheduled_datetime),
      'EEE MMM d · h:mm a'
    );
    const title = `New session: ${coachName}`;
    const body = `${coachName} scheduled a session (${when}). Tap to book!`;
    const sessionLink = sessionLinkPath(opts.sessionId);
    const smsBody = buildNewSessionSmsBody(row, coachName, programName);

    const sentPhones = new Set<string>();
    const inAppTasks: Promise<unknown>[] = [];
    const smsTasks: Promise<boolean>[] = [];
    const alertInserts: { session_id: string; parent_id: string; phone_number: string | null }[] = [];

    for (const parentId of parentIds) {
      if (bookedSet.has(parentId)) continue;

      const parent = (parents ?? []).find((p) => p.id === parentId);
      if (!parent) continue;

      const prefs = parseNotificationPreferences(parent.notification_preferences);

      if (wantsNewSessionPush(prefs)) {
        inAppTasks.push(
          createNotification(admin, {
            user_id: parentId,
            type: 'coach_new_session',
            title,
            body,
            data: {
              coach_id: coachId,
              session_id: opts.sessionId,
              link: sessionLink,
            },
          })
        );
        result.inAppSent += 1;
      }

      if (!wantsNewSessionSms(prefs)) continue;
      if (alertedSet.has(parentId)) continue;

      const phone = normalizePhone(parent.phone ?? undefined);
      if (!phone || sentPhones.has(phone)) continue;
      sentPhones.add(phone);

      smsTasks.push(
        sendSms(phone, smsBody, {
          admin,
          messageType: 'coach_new_session',
          recipientId: parentId,
          recipientLabel: 'Parent (follower)',
          sessionId: opts.sessionId,
          coachId,
        }).then((ok) => {
          if (ok) {
            result.smsSent += 1;
            alertInserts.push({
              session_id: opts.sessionId,
              parent_id: parentId,
              phone_number: phone,
            });
          }
          return ok;
        })
      );
    }

    await Promise.all(inAppTasks);
    await Promise.all(smsTasks);

    if (alertInserts.length > 0) {
      const { error: logErr } = await admin.from('session_sms_alerts').upsert(alertInserts, {
        onConflict: 'session_id,parent_id',
        ignoreDuplicates: true,
      });
      if (logErr) {
        console.warn('session_sms_alerts insert failed:', logErr.message);
      }
    }
  } catch (e) {
    console.warn('notifySessionScheduledFollowers failed:', e);
  }
  if (result.inAppSent === 0 && result.smsSent === 0) {
    console.info('notifySessionScheduledFollowers: no alerts sent', {
      sessionId: opts.sessionId,
      coachId,
    });
  }
  return result;
}

/** Clear alert log so re-publishing can notify followers again. */
export async function clearSessionSmsAlerts(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string
): Promise<void> {
  await admin.from('session_sms_alerts').delete().eq('session_id', sessionId);
}
