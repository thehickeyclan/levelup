import type { SupabaseClient } from '@supabase/supabase-js';
import { formatPhoneForSmsPaste } from '@/lib/phone';
import { normalizePhone, sendSms } from '@/lib/twilio';

type Admin = SupabaseClient;

/** Who receives the coach’s SMS blast */
export type SmsAudience = 'parents' | 'athletes' | 'both';

/**
 * Parent account only (`users.phone`). No athlete cell — use for coach “text parents” paste/SMS.
 */
export async function resolveParentAccountSmsPhone(admin: Admin, parentId: string): Promise<string | null> {
  const { data: u } = await admin.from('users').select('phone').eq('id', parentId).maybeSingle();
  return normalizePhone(u?.phone ?? undefined);
}

/**
 * Resolve SMS for a parent: users.phone first, then athlete cell on youth_wrestlers (fallback).
 * Prefer this for automated sends when reaching someone is more important than strict parent-only.
 */
export async function resolveParentSmsPhone(
  admin: Admin,
  parentId: string,
  youthWrestlerId: string | null
): Promise<string | null> {
  const up = await resolveParentAccountSmsPhone(admin, parentId);
  if (up) return up;
  if (youthWrestlerId) {
    const { data: yw } = await admin.from('youth_wrestlers').select('phone').eq('id', youthWrestlerId).maybeSingle();
    const yp = normalizePhone(yw?.phone ?? undefined);
    if (yp) return yp;
  }
  return null;
}

/** Athlete-only: cell on the youth wrestler profile (not parent account). */
export async function resolveAthleteSmsPhone(admin: Admin, youthWrestlerId: string): Promise<string | null> {
  const { data: yw } = await admin.from('youth_wrestlers').select('phone').eq('id', youthWrestlerId).maybeSingle();
  return normalizePhone(yw?.phone ?? undefined);
}

export type GroupSmsResult = {
  sent: number;
  skippedNoPhone: number;
  failed: Array<{ to: string; detail: string }>;
};

/**
 * Send the same SMS to unique numbers for this session based on audience.
 */
export async function sendSessionGroupSms(
  admin: Admin,
  sessionId: string,
  body: string,
  prefix: string,
  audience: SmsAudience = 'parents'
): Promise<GroupSmsResult> {
  const fullText = `${prefix}${body.trim()}`.slice(0, 1600);
  const { data: parts, error } = await admin
    .from('session_participants')
    .select('parent_id, youth_wrestler_id')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  const rows = parts ?? [];
  if (rows.length === 0) {
    return { sent: 0, skippedNoPhone: 0, failed: [] };
  }

  const phonesToSend = new Set<string>();
  let skippedNoPhone = 0;

  if (audience === 'parents' || audience === 'both') {
    const byParent = new Map<string, string | null>();
    for (const row of rows) {
      const pid = row.parent_id as string | undefined;
      if (!pid) continue;
      if (!byParent.has(pid)) {
        byParent.set(pid, (row as { youth_wrestler_id?: string | null }).youth_wrestler_id ?? null);
      }
    }
    for (const [parentId, ywId] of byParent) {
      const phone = await resolveParentSmsPhone(admin, parentId, ywId);
      if (!phone) {
        skippedNoPhone += 1;
        continue;
      }
      phonesToSend.add(phone);
    }
  }

  if (audience === 'athletes' || audience === 'both') {
    const ywIds = new Set<string>();
    for (const row of rows) {
      const ywid = (row as { youth_wrestler_id?: string | null }).youth_wrestler_id;
      if (ywid) ywIds.add(ywid);
    }
    for (const ywid of ywIds) {
      const phone = await resolveAthleteSmsPhone(admin, ywid);
      if (!phone) {
        skippedNoPhone += 1;
        continue;
      }
      phonesToSend.add(phone);
    }
  }

  const failed: Array<{ to: string; detail: string }> = [];
  let sent = 0;
  for (const phone of phonesToSend) {
    const ok = await sendSms(phone, fullText, {
      admin,
      messageType: 'session_group_sms',
      recipientLabel: audience === 'athletes' ? 'Athlete' : 'Parent',
      sessionId,
    });
    if (ok) sent += 1;
    else failed.push({ to: phone, detail: 'Twilio send failed' });
  }

  return { sent, skippedNoPhone, failed };
}

/**
 * Unified target string:
 * - `broadcast:parents` | `broadcast:athletes` | `broadcast:both`
 * - `parent:<uuid>` — one parent account in this session
 * - `athlete:<uuid>` — one youth wrestler in this session
 */
export async function sendSessionSms(
  admin: Admin,
  sessionId: string,
  body: string,
  prefix: string,
  target: string
): Promise<GroupSmsResult> {
  const t = target.trim();
  if (t.startsWith('broadcast:')) {
    const aud = t.replace('broadcast:', '') as SmsAudience;
    if (aud === 'athletes' || aud === 'both' || aud === 'parents') {
      return sendSessionGroupSms(admin, sessionId, body, prefix, aud);
    }
    return sendSessionGroupSms(admin, sessionId, body, prefix, 'parents');
  }

  const fullText = `${prefix}${body.trim()}`.slice(0, 1600);

  if (t.startsWith('parent:')) {
    const parentId = t.slice('parent:'.length);
    if (!parentId) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const { data: row } = await admin
      .from('session_participants')
      .select('youth_wrestler_id')
      .eq('session_id', sessionId)
      .eq('parent_id', parentId)
      .limit(1)
      .maybeSingle();
    if (!row) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const phone = await resolveParentSmsPhone(
      admin,
      parentId,
      (row as { youth_wrestler_id?: string | null }).youth_wrestler_id ?? null
    );
    if (!phone) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const ok = await sendSms(phone, fullText, {
      admin,
      messageType: 'session_sms_parent',
      recipientId: parentId,
      recipientLabel: 'Parent',
      sessionId,
    });
    if (ok) return { sent: 1, skippedNoPhone: 0, failed: [] };
    return { sent: 0, skippedNoPhone: 0, failed: [{ to: phone, detail: 'Twilio send failed' }] };
  }

  if (t.startsWith('athlete:')) {
    const ywId = t.slice('athlete:'.length);
    if (!ywId) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const { data: row } = await admin
      .from('session_participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('youth_wrestler_id', ywId)
      .maybeSingle();
    if (!row) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const phone = await resolveAthleteSmsPhone(admin, ywId);
    if (!phone) return { sent: 0, skippedNoPhone: 1, failed: [] };
    const ok = await sendSms(phone, fullText, {
      admin,
      messageType: 'session_sms_athlete',
      recipientLabel: 'Athlete',
      sessionId,
    });
    if (ok) return { sent: 1, skippedNoPhone: 0, failed: [] };
    return { sent: 0, skippedNoPhone: 0, failed: [{ to: phone, detail: 'Twilio send failed' }] };
  }

  return sendSessionGroupSms(admin, sessionId, body, prefix, 'parents');
}

function shortEmail(email: string | null | undefined): string {
  if (!email) return 'Parent';
  const local = email.split('@')[0] ?? email;
  return local.length > 24 ? `${local.slice(0, 22)}…` : local;
}

/** One row for coach clipboard (text from personal phone — two-way SMS). */
export type SessionSmsPhoneRow = { kind: 'parent' | 'athlete'; label: string; phone: string };

/**
 * Resolved parent + athlete cells for this session (same rules as SMS send).
 * Use newline-separated strings to paste into Messages “To” (Mac handles line breaks better than commas).
 */
export async function getSessionSmsPhonesForPersonalText(
  admin: Admin,
  sessionId: string
): Promise<{
  rows: SessionSmsPhoneRow[];
  /** Newline-separated 10-digit numbers (Mac/iOS Messages parses lines into separate recipients better than commas). */
  commaParents: string;
  commaAthletes: string;
  commaAll: string;
  skippedParents: number;
  skippedAthletes: number;
}> {
  const { data: parts, error } = await admin
    .from('session_participants')
    .select('parent_id, youth_wrestler_id, youth_wrestlers(first_name, last_name)')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  const rows = parts ?? [];
  if (rows.length === 0) {
    return {
      rows: [],
      commaParents: '',
      commaAthletes: '',
      commaAll: '',
      skippedParents: 0,
      skippedAthletes: 0,
    };
  }

  const parentIds = [...new Set(rows.map((r) => r.parent_id as string).filter(Boolean))];
  const { data: parentUsers } =
    parentIds.length > 0
      ? await admin.from('users').select('id, email').in('id', parentIds)
      : { data: [] };

  const parentKidNames = new Map<string, Set<string>>();
  for (const r of rows) {
    const pid = r.parent_id as string | undefined;
    if (!pid) continue;
    const yw = r.youth_wrestlers as { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null | undefined;
    const o = Array.isArray(yw) ? yw[0] : yw;
    const kid = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').trim() : '';
    if (!parentKidNames.has(pid)) parentKidNames.set(pid, new Set());
    if (kid) parentKidNames.get(pid)!.add(kid);
  }

  /** First wrestler on the session per parent — used to fall back to athlete cell when parent account has no phone. */
  const parentYwId = new Map<string, string | null>();
  for (const r of rows) {
    const pid = r.parent_id as string | undefined;
    if (!pid || parentYwId.has(pid)) continue;
    parentYwId.set(pid, (r as { youth_wrestler_id?: string | null }).youth_wrestler_id ?? null);
  }

  const parentRows: SessionSmsPhoneRow[] = [];
  let skippedParents = 0;
  for (const pid of parentIds) {
    const phone = await resolveParentSmsPhone(admin, pid, parentYwId.get(pid) ?? null);
    if (!phone) {
      skippedParents += 1;
      continue;
    }
    const u = parentUsers?.find((x) => x.id === pid);
    const kids = [...(parentKidNames.get(pid) ?? [])].join(', ') || 'athlete';
    parentRows.push({
      kind: 'parent',
      label: `Parent: ${shortEmail(u?.email)} (${kids})`,
      phone,
    });
  }

  const athleteRows: SessionSmsPhoneRow[] = [];
  let skippedAthletes = 0;
  const seenYw = new Set<string>();
  for (const r of rows) {
    const ywid = (r as { youth_wrestler_id?: string | null }).youth_wrestler_id;
    if (!ywid || seenYw.has(ywid)) continue;
    seenYw.add(ywid);
    const phone = await resolveAthleteSmsPhone(admin, ywid);
    if (!phone) {
      skippedAthletes += 1;
      continue;
    }
    const yw = r.youth_wrestlers as { first_name?: string; last_name?: string } | null;
    const o = Array.isArray(yw) ? yw[0] : yw;
    const name = o ? [o.first_name, o.last_name].filter(Boolean).join(' ').trim() : 'Athlete';
    athleteRows.push({ kind: 'athlete', label: `Athlete: ${name}`, phone });
  }

  const rowsOut = [...parentRows, ...athleteRows];

  const fmt = (e164: string) => formatPhoneForSmsPaste(e164);
  /** CRLF pastes into Mac/iOS Messages “To” more reliably than LF alone. */
  const sep = '\r\n';
  const commaParents = [...new Set(parentRows.map((r) => r.phone))].map(fmt).join(sep);
  const commaAthletes = [...new Set(athleteRows.map((r) => r.phone))].map(fmt).join(sep);

  /**
   * One line per session_participant — parent cell with youth-wrestler fallback (same as SMS send).
   * Repeats when one parent has multiple kids on the session.
   */
  const linesPerParticipant: string[] = [];
  for (const r of rows) {
    const pid = r.parent_id as string | undefined;
    const ywid = (r as { youth_wrestler_id?: string | null }).youth_wrestler_id ?? null;
    if (!pid) continue;
    const phone = await resolveParentSmsPhone(admin, pid, ywid);
    if (!phone) continue;
    linesPerParticipant.push(fmt(phone));
  }
  const commaAll = linesPerParticipant.join(sep);

  return {
    rows: rowsOut,
    commaParents,
    commaAthletes,
    commaAll,
    skippedParents,
    skippedAthletes,
  };
}

const SESSION_ID_CHUNK = 200;
const YOUTH_ID_CHUNK = 200;

/**
 * Distinct athlete (youth) cells for anyone who has ever been on `session_participants`
 * for a session owned by `coachAthleteId`. Deduped by normalized number; same formatting as
 * per-session athlete paste (`formatPhoneForSmsPaste`).
 */
export async function getCoachAllTimeAthletePhonesForPersonalText(
  admin: Admin,
  coachAthleteId: string
): Promise<{ commaAll: string; athleteCount: number; skippedNoPhone: number }> {
  const { data: sessRows, error: sessErr } = await admin
    .from('sessions')
    .select('id')
    .eq('athlete_id', coachAthleteId);
  if (sessErr) throw new Error(sessErr.message);
  const sessionIds = (sessRows ?? []).map((r) => r.id as string);
  if (sessionIds.length === 0) {
    return { commaAll: '', athleteCount: 0, skippedNoPhone: 0 };
  }

  const ywIds = new Set<string>();
  for (let i = 0; i < sessionIds.length; i += SESSION_ID_CHUNK) {
    const chunk = sessionIds.slice(i, i + SESSION_ID_CHUNK);
    const { data: parts, error: pErr } = await admin
      .from('session_participants')
      .select('youth_wrestler_id')
      .in('session_id', chunk);
    if (pErr) throw new Error(pErr.message);
    for (const p of parts ?? []) {
      const id = (p as { youth_wrestler_id?: string | null }).youth_wrestler_id;
      if (id) ywIds.add(id);
    }
  }

  const ids = [...ywIds];
  if (ids.length === 0) {
    return { commaAll: '', athleteCount: 0, skippedNoPhone: 0 };
  }

  let skippedNoPhone = 0;
  const e164Unique = new Set<string>();

  for (let i = 0; i < ids.length; i += YOUTH_ID_CHUNK) {
    const chunk = ids.slice(i, i + YOUTH_ID_CHUNK);
    const { data: yws, error: yErr } = await admin.from('youth_wrestlers').select('phone').in('id', chunk);
    if (yErr) throw new Error(yErr.message);
    for (const yw of yws ?? []) {
      const e164 = normalizePhone((yw as { phone?: string | null }).phone ?? undefined);
      if (!e164) {
        skippedNoPhone += 1;
        continue;
      }
      e164Unique.add(e164);
    }
  }

  const commaAll = [...e164Unique]
    .sort((a, b) => a.localeCompare(b))
    .map((e) => formatPhoneForSmsPaste(e))
    .join('\r\n');

  return {
    commaAll,
    athleteCount: e164Unique.size,
    skippedNoPhone,
  };
}
