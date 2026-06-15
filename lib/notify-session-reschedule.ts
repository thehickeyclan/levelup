import type { SupabaseClient } from '@supabase/supabase-js';
import { formatEST } from '@/lib/format-date';
import { createNotification } from '@/lib/notifications';
import { sendParentsSessionRescheduleSms } from '@/lib/twilio';

type Admin = SupabaseClient;

/** In-app + SMS when a session's scheduled time changes. */
export async function notifyParentsSessionTimeChange(
  admin: Admin,
  opts: {
    sessionId: string;
    athleteId: string;
    parentId: string | null;
    coachName: string;
    previousIso: string;
    newIso: string;
    excludeUserId?: string | null;
  }
): Promise<void> {
  if (opts.previousIso === opts.newIso) return;

  const oldWhen = formatEST(new Date(opts.previousIso), 'EEE, MMM d, h:mm a');
  const newWhen = formatEST(new Date(opts.newIso), 'EEE, MMM d, h:mm a');

  const { data: participants } = await admin
    .from('session_participants')
    .select('parent_id')
    .eq('session_id', opts.sessionId);
  const parentIdsToNotify = new Set<string>();
  for (const row of participants ?? []) {
    const pid = (row as { parent_id?: string | null }).parent_id;
    if (pid) parentIdsToNotify.add(pid);
  }
  if (parentIdsToNotify.size === 0 && opts.parentId) {
    parentIdsToNotify.add(opts.parentId);
  }

  try {
    for (const parentId of parentIdsToNotify) {
      if (parentId === opts.excludeUserId) continue;
      await createNotification(admin, {
        user_id: parentId,
        type: 'session_rescheduled',
        title: 'Session rescheduled',
        body: `Your session with ${opts.coachName} was moved from ${oldWhen} to ${newWhen}.`,
        data: { link: '/bookings', session_id: opts.sessionId },
        sessionId: opts.sessionId,
      });
    }

    if (opts.athleteId) {
      await createNotification(admin, {
        user_id: opts.athleteId,
        type: 'session_rescheduled',
        title: 'Session rescheduled',
        body: `Your session was moved from ${oldWhen} to ${newWhen}.`,
        data: { link: '/athlete-dashboard', session_id: opts.sessionId },
        sessionId: opts.sessionId,
        coachId: opts.athleteId,
      });
    }
  } catch (notifErr) {
    console.warn('[session time change] in-app notify parents failed:', notifErr);
  }

  try {
    await sendParentsSessionRescheduleSms(admin, {
      sessionId: opts.sessionId,
      coachAthleteId: opts.athleteId,
      coachName: opts.coachName,
      oldWhen,
      newWhen,
      excludeUserId: opts.excludeUserId,
      fallbackParentId: opts.parentId,
    });
  } catch (smsErr) {
    console.warn('[session time change] parent SMS failed:', smsErr);
  }
}

/** In-app notification when session location changes. */
export async function notifyParentsSessionFacilityChange(
  admin: Admin,
  opts: {
    sessionId: string;
    coachName: string;
    previousFacilityName: string;
    newFacilityName: string;
    excludeUserId?: string | null;
    parentId: string | null;
  }
): Promise<void> {
  if (opts.previousFacilityName === opts.newFacilityName) return;

  const { data: participants } = await admin
    .from('session_participants')
    .select('parent_id')
    .eq('session_id', opts.sessionId);
  const parentIdsToNotify = new Set<string>();
  for (const row of participants ?? []) {
    const pid = (row as { parent_id?: string | null }).parent_id;
    if (pid) parentIdsToNotify.add(pid);
  }
  if (parentIdsToNotify.size === 0 && opts.parentId) {
    parentIdsToNotify.add(opts.parentId);
  }

  const body = `Your session with ${opts.coachName} moved from ${opts.previousFacilityName} to ${opts.newFacilityName}.`;

  try {
    for (const parentId of parentIdsToNotify) {
      if (parentId === opts.excludeUserId) continue;
      await createNotification(admin, {
        user_id: parentId,
        type: 'session_rescheduled',
        title: 'Session location updated',
        body,
        data: { link: '/bookings', session_id: opts.sessionId },
        sessionId: opts.sessionId,
      });
    }
  } catch (notifErr) {
    console.warn('[session facility change] in-app notify parents failed:', notifErr);
  }
}
