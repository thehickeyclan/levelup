/**
 * Twilio SMS for coach alerts (e.g. when someone signs up for their session).
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID
 * or TWILIO_FROM_NUMBER / TWILIO_PHONE_NUMBER in env (Messaging Service SID is preferred).
 * Coaches store cell on users.phone; we send only when present (with zelle-shaped fallback).
 */

import { formatEST } from './format-date';
import { logMessage } from './message-log';
import { getSessionTypeDisplay } from './session-type-display';
import { formatWeightClassLabel } from './wrestler-roster-display';

export type SupabaseAdmin = import('@supabase/supabase-js').SupabaseClient;

const getConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Support TWILIO_PHONE_NUMBER (common Vercel misname); FROM wins if both set.
  const from =
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_PHONE_NUMBER?.trim() ||
    '';
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || '';
  if (!accountSid || !authToken) return null;
  if (!messagingServiceSid && !from) return null;
  return { accountSid, authToken, from, messagingServiceSid };
};

/** Normalize to E.164-ish: digits only, assume US +1 if 10 digits. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
}

export type SmsLogContext = {
  admin?: SupabaseAdmin;
  messageType?: string;
  recipientId?: string;
  recipientLabel?: string;
  sessionId?: string;
  coachId?: string;
};

/**
 * Send an SMS. No-op if Twilio is not configured or to is invalid.
 * When `logCtx.admin` is set, every attempt is written to `message_log` (sent, Twilio error, missing config, bad number, or network error).
 */
export async function sendSms(to: string, body: string, logCtx?: SmsLogContext): Promise<boolean> {
  const config = getConfig();
  const phone = normalizePhone(to);
  const rawToHint = to && String(to).trim() ? String(to).trim().slice(0, 48) : null;

  const logFailure = async (errorDetail: string) => {
    if (!logCtx?.admin) return;
    await logMessage(logCtx.admin, {
      channel: 'sms',
      recipientId: logCtx.recipientId,
      recipientPhone: phone ?? rawToHint,
      recipientLabel: logCtx.recipientLabel,
      messageType: logCtx.messageType ?? 'sms',
      body,
      sessionId: logCtx.sessionId,
      coachId: logCtx.coachId,
      status: 'failed',
      errorDetail,
    });
  };

  if (!config) {
    await logFailure(
      'Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID, TWILIO_FROM_NUMBER, or TWILIO_PHONE_NUMBER on the server).',
    );
    return false;
  }
  if (!phone) {
    await logFailure('Invalid or missing phone number (could not normalize to E.164).');
    return false;
  }

  try {
    const params = new URLSearchParams({
      To: phone,
      Body: body.slice(0, 1600),
    });
    if (config.messagingServiceSid) {
      params.set('MessagingServiceSid', config.messagingServiceSid);
    } else {
      params.set('From', config.from);
    }
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.warn('Twilio SMS failed', res.status, err);
      await logFailure(`Twilio HTTP ${res.status}: ${err.slice(0, 500)}`);
      return false;
    }
    if (logCtx?.admin) {
      await logMessage(logCtx.admin, {
        channel: 'sms',
        recipientId: logCtx.recipientId,
        recipientPhone: phone,
        recipientLabel: logCtx.recipientLabel,
        messageType: logCtx.messageType ?? 'sms',
        body,
        sessionId: logCtx.sessionId,
        coachId: logCtx.coachId,
        status: 'sent',
      });
    }
    return true;
  } catch (e) {
    console.warn('Twilio SMS error', e);
    await logFailure(e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Prefer users.phone; fall back to athletes.zelle_email if it looks like a phone (coaches often put cell there for Zelle). */
function pickCoachPhone(row: { phone?: string; zelle_email?: string } | null): string | null {
  if (!row) return null;
  const p = (row as { phone?: string }).phone;
  if (p && normalizePhone(p)) return p;
  const z = (row as { zelle_email?: string }).zelle_email;
  if (z && normalizePhone(z)) return z; // Zelle allows email or phone — use if phone-shaped
  return null;
}

export async function resolveCoachSmsE164(admin: SupabaseAdmin, coachUserId: string): Promise<string | null> {
  const [{ data: userRow }, { data: athleteRow }] = await Promise.all([
    admin.from('users').select('phone').eq('id', coachUserId).maybeSingle(),
    admin.from('athletes').select('zelle_email').eq('id', coachUserId).maybeSingle(),
  ]);
  const raw = pickCoachPhone({
    phone: userRow?.phone ?? undefined,
    zelle_email: athleteRow?.zelle_email ?? undefined,
  });
  return raw ? normalizePhone(raw) : null;
}

/** Comma-separated phones in env + any `users.phone` for role=admin. Deduped E.164. */
async function collectAdminBookingAlertPhonesE164(admin: SupabaseAdmin): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const n = normalizePhone(raw ?? undefined);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  const envRaw = process.env.ADMIN_BOOKING_ALERT_PHONES || '';
  for (const part of envRaw.split(',')) push(part.trim());

  const { data: admins } = await admin.from('users').select('phone').eq('role', 'admin');
  for (const row of admins ?? []) push((row as { phone?: string }).phone);

  return out;
}

/** Optional parent context for booking confirmation SMS (separate from coach/ops alerts). */
export type BookingSmsStakeholders = {
  parentId?: string | null;
  youthWrestlerId?: string | null;
};

function formatPersonName(first?: string | null, last?: string | null): string | null {
  const n = [first, last].filter(Boolean).join(' ').trim();
  return n || null;
}

type BookingSmsContext = {
  coachName: string;
  wrestlerName: string | null;
  wrestlerWeight: string | null;
  facilityName: string | null;
  sessionUrl: string | null;
  dateStr: string;
};

function bookingSmsWrestlerLabel(ctx: BookingSmsContext, fallback: string): string {
  const who = ctx.wrestlerName ?? fallback;
  return ctx.wrestlerWeight ? `${who}, ${ctx.wrestlerWeight}` : who;
}

async function loadBookingSmsContext(
  admin: SupabaseAdmin,
  opts: {
    coachUserId: string;
    dateStr: string;
    sessionId?: string;
    youthWrestlerId?: string | null;
    parentId?: string | null;
  }
): Promise<BookingSmsContext> {
  const origin = bookingLinksBase();
  const sessionUrl = opts.sessionId && origin ? `${origin}/sessions/${opts.sessionId}` : null;

  const [{ data: athlete }, sessionRes, ywRes] = await Promise.all([
    admin.from('athletes').select('first_name, last_name').eq('id', opts.coachUserId).maybeSingle(),
    opts.sessionId
      ? admin.from('sessions').select('facilities(name)').eq('id', opts.sessionId).maybeSingle()
      : Promise.resolve({ data: null as null }),
    opts.youthWrestlerId
      ? admin
          .from('youth_wrestlers')
          .select('first_name, last_name, weight_class')
          .eq('id', opts.youthWrestlerId)
          .maybeSingle()
      : Promise.resolve({ data: null as null }),
  ]);

  const coachName = formatPersonName(athlete?.first_name, athlete?.last_name) ?? 'Coach';

  let wrestlerName = formatPersonName(ywRes.data?.first_name, ywRes.data?.last_name);

  if (!wrestlerName && opts.sessionId && opts.parentId) {
    const { data: part } = await admin
      .from('session_participants')
      .select('roster_first_name, roster_last_name, youth_wrestlers(first_name, last_name)')
      .eq('session_id', opts.sessionId)
      .eq('parent_id', opts.parentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (part) {
      const raw = (
        part as {
          youth_wrestlers?:
            | { first_name?: string; last_name?: string }
            | { first_name?: string; last_name?: string }[]
            | null;
        }
      ).youth_wrestlers;
      const yw = Array.isArray(raw) ? raw[0] : raw;
      wrestlerName =
        formatPersonName(yw?.first_name, yw?.last_name) ??
        formatPersonName(
          (part as { roster_first_name?: string }).roster_first_name,
          (part as { roster_last_name?: string }).roster_last_name
        );
    }
  }

  const facRaw = (sessionRes.data as { facilities?: { name?: string } | { name?: string }[] | null } | null)
    ?.facilities;
  const facility = Array.isArray(facRaw) ? facRaw[0] : facRaw;
  const facilityName = (facility as { name?: string } | undefined)?.name?.trim() || null;

  const wrestlerWeight = formatWeightClassLabel(
    (ywRes.data as { weight_class?: string | null } | null)?.weight_class ?? null
  );

  return { coachName, wrestlerName, wrestlerWeight, facilityName, sessionUrl, dateStr: opts.dateStr };
}

function bookingSmsFacilitySuffix(facilityName: string | null): string {
  return facilityName ? ` @ ${facilityName}` : '';
}

function buildParentBookingConfirmBody(ctx: BookingSmsContext): string {
  const who = bookingSmsWrestlerLabel(ctx, 'Your athlete');
  const place = bookingSmsFacilitySuffix(ctx.facilityName);
  const link = ctx.sessionUrl ? ` ${ctx.sessionUrl}` : ' Open The Guild app → My bookings.';
  return `The Guild: ${who} is booked with Coach ${ctx.coachName}, ${ctx.dateStr}${place}.${link}`.slice(
    0,
    1600
  );
}

function buildCoachNewSignupBody(ctx: BookingSmsContext): string {
  const wrestler = bookingSmsWrestlerLabel(ctx, 'A wrestler');
  const place = bookingSmsFacilitySuffix(ctx.facilityName);
  const link = ctx.sessionUrl ? ` ${ctx.sessionUrl}` : ' Check My sessions in the app.';
  return `The Guild: New signup — ${wrestler} for your session ${ctx.dateStr}${place}.${link}`.slice(
    0,
    1600
  );
}

function buildAdminBookingAlertBody(ctx: BookingSmsContext): string {
  const wrestler = bookingSmsWrestlerLabel(ctx, 'New athlete');
  const place = bookingSmsFacilitySuffix(ctx.facilityName);
  return `The Guild (ops): ${wrestler} booked · Coach ${ctx.coachName} · ${ctx.dateStr}${place}`.slice(
    0,
    1600
  );
}

async function resolveParentPhoneE164(
  admin: SupabaseAdmin,
  parentId: string,
  youthWrestlerId: string | null | undefined
): Promise<string | null> {
  const { data: u } = await admin.from('users').select('phone').eq('id', parentId).maybeSingle();
  const up = normalizePhone(u?.phone ?? undefined);
  if (up) return up;
  if (youthWrestlerId) {
    const { data: yw } = await admin.from('youth_wrestlers').select('phone').eq('id', youthWrestlerId).maybeSingle();
    const yp = normalizePhone(yw?.phone ?? undefined);
    if (yp) return yp;
  }
  return null;
}

function bookingLinksBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

/**
 * SMS each registered parent (and book-a-coach parent when there are no participant rows yet).
 * Matches parent booking copy ("The Guild:"). Skips excludeUserId (e.g. parent who rescheduled in-app).
 */
export async function sendParentsSessionRescheduleSms(
  admin: SupabaseAdmin,
  opts: {
    sessionId: string;
    coachAthleteId: string;
    coachName: string;
    oldWhen: string;
    newWhen: string;
    excludeUserId?: string | null;
    fallbackParentId?: string | null;
  }
): Promise<void> {
  const { data: parts, error } = await admin
    .from('session_participants')
    .select('parent_id, youth_wrestler_id')
    .eq('session_id', opts.sessionId);
  if (error) {
    console.warn('[parent reschedule sms] participants', error.message);
    return;
  }

  const byParent = new Map<string, string | null>();
  for (const row of parts ?? []) {
    const pid = (row as { parent_id?: string | null }).parent_id;
    if (!pid) continue;
    if (!byParent.has(pid)) {
      byParent.set(pid, (row as { youth_wrestler_id?: string | null }).youth_wrestler_id ?? null);
    }
  }
  if (byParent.size === 0 && opts.fallbackParentId) {
    byParent.set(opts.fallbackParentId, null);
  }

  const origin = bookingLinksBase();
  const bookingsUrl = origin ? `${origin}/bookings` : '';
  const suffix = bookingsUrl
    ? `Details: ${bookingsUrl}`
    : 'Open the app → My bookings for details.';
  const body = `The Guild: Session with ${opts.coachName} moved from ${opts.oldWhen} to ${opts.newWhen}. ${suffix}`.slice(
    0,
    1600
  );

  const sentPhones = new Set<string>();
  for (const [parentId, ywId] of byParent) {
    if (parentId === opts.excludeUserId) continue;
    const phone = await resolveParentPhoneE164(admin, parentId, ywId);
    if (!phone) {
      await logSmsSkipped(admin, {
        messageType: 'parent_reschedule_skipped',
        recipientLabel: 'Parent',
        recipientId: parentId,
        sessionId: opts.sessionId,
        coachId: opts.coachAthleteId,
        detail:
          'No parent SMS number: add users.phone on the parent account, or a wrestler cell on the athlete profile.',
      });
      continue;
    }
    if (sentPhones.has(phone)) continue;
    sentPhones.add(phone);
    await sendSms(phone, body, {
      admin,
      messageType: 'session_rescheduled',
      recipientId: parentId,
      recipientLabel: 'Parent',
      sessionId: opts.sessionId,
      coachId: opts.coachAthleteId,
    });
  }
}

async function logSmsSkipped(
  admin: SupabaseAdmin,
  opts: {
    messageType: string;
    recipientLabel: string;
    recipientId?: string | null;
    sessionId?: string;
    coachId?: string;
    detail: string;
  }
): Promise<void> {
  await logMessage(admin, {
    channel: 'sms',
    recipientId: opts.recipientId ?? null,
    recipientLabel: opts.recipientLabel,
    messageType: opts.messageType,
    body: null,
    sessionId: opts.sessionId ?? null,
    coachId: opts.coachId ?? null,
    status: 'failed',
    errorDetail: opts.detail,
  });
}

/**
 * Coach SMS + ops/admin SMS + optional parent confirmation for every new booking/signup.
 *
 * Ops: `ADMIN_BOOKING_ALERT_PHONES` and every `users.phone` where `role = admin`.
 * Parent: `users.phone`, else wrestler `youth_wrestlers.phone` when `youthWrestlerId` is set.
 * All attempts (including skips) are written to `message_log` when the table exists.
 */
export async function notifyCoachAndAdminsNewBooking(
  admin: SupabaseAdmin,
  coachUserId: string,
  dateStr: string,
  sessionId?: string,
  stakeholders?: BookingSmsStakeholders
): Promise<void> {
  const sid = sessionId ?? '';
  const parentId = stakeholders?.parentId?.trim() || null;
  const ywid = stakeholders?.youthWrestlerId ?? null;

  const ctx = await loadBookingSmsContext(admin, {
    coachUserId,
    dateStr,
    sessionId,
    youthWrestlerId: ywid,
    parentId,
  });

  await sendCoachNewSignupSms(admin, coachUserId, dateStr, sessionId, ctx);

  const coachE164 = await resolveCoachSmsE164(admin, coachUserId);
  const opsTargets = await collectAdminBookingAlertPhonesE164(admin);
  const adminBody = buildAdminBookingAlertBody(ctx);

  if (opsTargets.length === 0) {
    await logSmsSkipped(admin, {
      messageType: 'admin_booking_alert_skipped',
      recipientLabel: 'Admin ops',
      sessionId: sid,
      coachId: coachUserId,
      detail:
        'No admin alert numbers configured. Set ADMIN_BOOKING_ALERT_PHONES (comma-separated) and/or add cell numbers to users.phone for admin accounts.',
    });
  } else {
    for (const to of opsTargets) {
      if (coachE164 && to === coachE164) continue;
      await sendSms(to, adminBody, {
        admin,
        messageType: 'admin_booking_alert',
        recipientLabel: 'Admin ops',
        sessionId,
        coachId: coachUserId,
      });
    }
  }

  if (!parentId) return;

  const parentPhone = await resolveParentPhoneE164(admin, parentId, ywid);
  const parentBody = buildParentBookingConfirmBody(ctx);

  if (!parentPhone) {
    await logSmsSkipped(admin, {
      messageType: 'parent_booking_confirm_skipped',
      recipientLabel: 'Parent',
      recipientId: parentId,
      sessionId: sid,
      coachId: coachUserId,
      detail:
        'No parent SMS number: add users.phone on the parent account, or a wrestler cell on the athlete profile.',
    });
    return;
  }

  await sendSms(parentPhone, parentBody, {
    admin,
    messageType: 'parent_booking_confirm',
    recipientId: parentId,
    recipientLabel: 'Parent',
    sessionId: sid,
    coachId: coachUserId,
  });
}

/**
 * If the coach has a phone on file (users.phone or athletes.zelle_email when phone-shaped), send SMS.
 * Prefer {@link notifyCoachAndAdminsNewBooking} for booking flows so ops can get a copy.
 */
export async function sendCoachNewSignupSms(
  admin: SupabaseAdmin,
  coachUserId: string,
  dateStr: string,
  sessionId?: string,
  ctxIn?: BookingSmsContext
): Promise<void> {
  const phone = await resolveCoachSmsE164(admin, coachUserId);
  if (!phone) {
    await logSmsSkipped(admin, {
      messageType: 'coach_new_signup_skipped',
      recipientLabel: 'Coach',
      recipientId: coachUserId,
      sessionId: sessionId ?? '',
      coachId: coachUserId,
      detail:
        'No coach phone on file. Add cell to Account (users.phone) or a phone-style number in Zelle on the coach athlete profile.',
    });
    return;
  }
  const ctx =
    ctxIn ??
    (await loadBookingSmsContext(admin, { coachUserId, dateStr, sessionId }));
  const body = buildCoachNewSignupBody(ctx);
  await sendSms(phone, body, {
    admin,
    messageType: 'coach_new_signup',
    recipientId: coachUserId,
    recipientLabel: 'Coach',
    sessionId,
    coachId: coachUserId,
  });
}

type SessionCompletedSmsContext = {
  coachName: string;
  typeLabel: string;
  dateStr: string;
  facilityName: string | null;
  paidCount: number;
  wrestlerSummary: string | null;
};

function participantWrestlerName(part: {
  youth_wrestlers?:
    | { first_name?: string; last_name?: string }
    | { first_name?: string; last_name?: string }[]
    | null;
  roster_first_name?: string | null;
  roster_last_name?: string | null;
}): string | null {
  const raw = part.youth_wrestlers;
  const yw = Array.isArray(raw) ? raw[0] : raw;
  return (
    formatPersonName(yw?.first_name, yw?.last_name) ??
    formatPersonName(part.roster_first_name, part.roster_last_name)
  );
}

async function loadSessionCompletedSmsContext(
  admin: SupabaseAdmin,
  sessionId: string,
  coachUserId: string
): Promise<SessionCompletedSmsContext | null> {
  const [{ data: athlete }, { data: session }, { data: parts }] = await Promise.all([
    admin.from('athletes').select('first_name, last_name').eq('id', coachUserId).maybeSingle(),
    admin
      .from('sessions')
      .select('scheduled_datetime, session_type, facilities(name)')
      .eq('id', sessionId)
      .maybeSingle(),
    admin
      .from('session_participants')
      .select('youth_wrestlers(first_name, last_name), roster_first_name, roster_last_name')
      .eq('session_id', sessionId)
      .eq('paid', true),
  ]);

  if (!session) return null;

  const coachName = formatPersonName(athlete?.first_name, athlete?.last_name) ?? 'Coach';
  const dt = (session as { scheduled_datetime?: string | null }).scheduled_datetime;
  const dateStr = dt ? formatEST(new Date(dt), 'EEE MMM d, h:mm a') : 'session';
  const typeLabel = getSessionTypeDisplay(
    (session as { session_type?: string | null }).session_type
  ).label;
  const facRaw = (session as { facilities?: { name?: string } | { name?: string }[] | null })
    .facilities;
  const facility = Array.isArray(facRaw) ? facRaw[0] : facRaw;
  const facilityName = (facility as { name?: string } | undefined)?.name?.trim() || null;

  const names: string[] = [];
  for (const row of parts ?? []) {
    const name = participantWrestlerName(
      row as {
        youth_wrestlers?:
          | { first_name?: string; last_name?: string }
          | { first_name?: string; last_name?: string }[]
          | null;
        roster_first_name?: string | null;
        roster_last_name?: string | null;
      }
    );
    if (name) names.push(name);
  }

  const paidCount = (parts ?? []).length;
  const wrestlerSummary =
    names.length > 0
      ? names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '')
      : null;

  return { coachName, typeLabel, dateStr, facilityName, paidCount, wrestlerSummary };
}

function buildAdminSessionCompletedBody(ctx: SessionCompletedSmsContext): string {
  const place = bookingSmsFacilitySuffix(ctx.facilityName);
  const athletes =
    ctx.paidCount === 0
      ? 'No paid registrants'
      : ctx.wrestlerSummary
        ? `${ctx.paidCount} paid (${ctx.wrestlerSummary})`
        : `${ctx.paidCount} paid`;
  return `The Guild (ops): Coach ${ctx.coachName} marked complete — ${ctx.typeLabel}, ${ctx.dateStr}${place}. ${athletes}. Admin → Ready to pay.`.slice(
    0,
    1600
  );
}

/**
 * SMS admin ops when a coach marks their own session complete (not when admin marks on their behalf).
 * Uses ADMIN_BOOKING_ALERT_PHONES and/or users.phone for role=admin — same as booking alerts.
 */
export async function notifyAdminsSessionCompleted(
  admin: SupabaseAdmin,
  opts: { sessionId: string; coachUserId: string; completedByUserId: string }
): Promise<void> {
  if (opts.completedByUserId !== opts.coachUserId) return;

  const ctx = await loadSessionCompletedSmsContext(admin, opts.sessionId, opts.coachUserId);
  if (!ctx) return;

  const opsTargets = await collectAdminBookingAlertPhonesE164(admin);
  const body = buildAdminSessionCompletedBody(ctx);
  const sid = opts.sessionId;

  if (opsTargets.length === 0) {
    await logSmsSkipped(admin, {
      messageType: 'admin_session_completed_skipped',
      recipientLabel: 'Admin ops',
      sessionId: sid,
      coachId: opts.coachUserId,
      detail:
        'No admin alert numbers configured. Set ADMIN_BOOKING_ALERT_PHONES (comma-separated) and/or add cell numbers to users.phone for admin accounts.',
    });
    return;
  }

  const coachE164 = await resolveCoachSmsE164(admin, opts.coachUserId);
  for (const to of opsTargets) {
    if (coachE164 && to === coachE164) continue;
    await sendSms(to, body, {
      admin,
      messageType: 'admin_session_completed',
      recipientLabel: 'Admin ops',
      sessionId: sid,
      coachId: opts.coachUserId,
    });
  }
}

/**
 * SMS coach when a parent leaves a new review (not on edit/update of same review).
 * Uses users.phone or phone-shaped athletes.zelle_email — same as signup SMS.
 */
export async function sendCoachNewReviewSms(
  admin: SupabaseAdmin,
  coachAthleteId: string,
  rating: number,
  profileUrl: string
): Promise<void> {
  const [{ data: userRow }, { data: athleteRow }] = await Promise.all([
    admin.from('users').select('phone').eq('id', coachAthleteId).maybeSingle(),
    admin.from('athletes').select('zelle_email').eq('id', coachAthleteId).maybeSingle(),
  ]);
  const phone = pickCoachPhone({
    phone: userRow?.phone ?? undefined,
    zelle_email: athleteRow?.zelle_email ?? undefined,
  });
  if (!phone) return;
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  const starLabel = r === 1 ? '1-star' : `${r}-star`;
  const body = `The Guild: You got a new ${starLabel} review. See it now: ${profileUrl}`;
  await sendSms(phone, body, {
    admin,
    messageType: 'coach_new_review',
    recipientId: coachAthleteId,
    recipientLabel: 'Coach',
    coachId: coachAthleteId,
  });
}
