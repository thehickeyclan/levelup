import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCoachSmsE164, sendSms } from '@/lib/twilio';

export const COACH_ADMIN_SMS_MAX_BODY = 1200;
const SMS_PREFIX = 'The Guild: ';

export type CoachSmsRecipientRow = {
  id: string;
  name: string;
  email: string;
  hasPhone: boolean;
};

export type CoachSmsBroadcastResult = {
  sent: number;
  skippedNoPhone: number;
  failed: number;
  targeted: number;
};

function formatCoachName(row: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const n = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  if (n) return n;
  const email = (row.email ?? '').trim();
  if (email) return email.split('@')[0] ?? email;
  return 'Coach';
}

/** Active coaches (`role = coach`, not archived) with whether we can SMS them. */
export async function listCoachSmsRecipients(
  admin: SupabaseClient
): Promise<CoachSmsRecipientRow[]> {
  const { data: rows, error } = await admin
    .from('users')
    .select('id, email, first_name, last_name, phone')
    .eq('role', 'coach')
    .is('archived_at', null)
    .order('last_name', { ascending: true });

  if (error) throw new Error(error.message);

  const coaches = rows ?? [];
  const withPhone = await Promise.all(
    coaches.map(async (row) => {
      const id = (row as { id: string }).id;
      const e164 = await resolveCoachSmsE164(admin, id);
      return {
        id,
        name: formatCoachName(row as { first_name?: string; last_name?: string; email?: string }),
        email: ((row as { email?: string }).email ?? '').trim(),
        hasPhone: Boolean(e164),
      };
    })
  );

  return withPhone;
}

/**
 * Send the same SMS to active coaches (one Twilio message per coach).
 * `coachIds` optional — when omitted, targets every coach with a phone on file.
 */
export async function sendCoachAdminBroadcast(
  admin: SupabaseClient,
  message: string,
  opts?: { coachIds?: string[] }
): Promise<CoachSmsBroadcastResult> {
  const bodyTrim = message.trim();
  if (!bodyTrim) {
    return { sent: 0, skippedNoPhone: 0, failed: 0, targeted: 0 };
  }

  const fullText = `${SMS_PREFIX}${bodyTrim}`.slice(0, 1600);
  const all = await listCoachSmsRecipients(admin);
  const idSet =
    opts?.coachIds && opts.coachIds.length > 0 ? new Set(opts.coachIds) : null;
  const targets = idSet ? all.filter((c) => idSet.has(c.id)) : all;

  let sent = 0;
  let skippedNoPhone = 0;
  let failed = 0;
  const seenPhones = new Set<string>();

  for (const coach of targets) {
    const e164 = await resolveCoachSmsE164(admin, coach.id);
    if (!e164) {
      skippedNoPhone += 1;
      continue;
    }
    if (seenPhones.has(e164)) continue;
    seenPhones.add(e164);

    const ok = await sendSms(e164, fullText, {
      admin,
      messageType: 'admin_coach_broadcast',
      recipientId: coach.id,
      recipientLabel: 'Coach',
      coachId: coach.id,
    });
    if (ok) sent += 1;
    else failed += 1;
  }

  return {
    sent,
    skippedNoPhone,
    failed,
    targeted: targets.length,
  };
}
