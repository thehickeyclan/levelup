import type { SupabaseClient } from '@supabase/supabase-js';
import { isProfileComplete } from '@/lib/athletes';
import type { Athlete } from '@/types';
import {
  computeActivationSteps,
  isCoreActivationComplete,
  shouldShowSlotNudges,
  suggestOpenSlots,
  type CoachActivationStep,
  type SlotNudgeSuggestion,
} from '@/lib/coach-activation';

export type CoachActivationPanelData = {
  steps: CoachActivationStep[];
  coreComplete: boolean;
  showPanel: boolean;
  slotNudges: SlotNudgeSuggestion[];
  bookingUrl: string;
};

export async function fetchCoachActivationPanelData(
  db: SupabaseClient,
  coachId: string,
  athlete: Athlete,
  nowIso: string
): Promise<CoachActivationPanelData> {
  const horizonEnd = new Date(nowIso);
  horizonEnd.setDate(horizonEnd.getDate() + 14);

  const [
    { count: serviceCount },
    { count: weeklyCount },
    { count: datedSlotCount },
    { data: weeklyWindows },
    { data: upcomingSessions },
    { count: privateServiceCount },
  ] = await Promise.all([
    db
      .from('athlete_services')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', coachId)
      .eq('active', true),
    db
      .from('athlete_availability')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', coachId),
    db
      .from('athlete_availability_slots')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', coachId),
    db
      .from('athlete_availability')
      .select('day_of_week, start_time, end_time')
      .eq('athlete_id', coachId),
    db
      .from('sessions')
      .select('scheduled_datetime, duration_minutes, join_policy')
      .eq('athlete_id', coachId)
      .eq('status', 'scheduled')
      .gte('scheduled_datetime', nowIso)
      .lte('scheduled_datetime', horizonEnd.toISOString())
      .order('scheduled_datetime', { ascending: true }),
    db
      .from('athlete_services')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', coachId)
      .eq('active', true)
      .eq('session_type', 'private'),
  ]);

  const hasRateCard = (serviceCount ?? 0) > 0;
  const hasCalendar = (weeklyCount ?? 0) > 0 || (datedSlotCount ?? 0) > 0;
  const hasUpcomingSession = (upcomingSessions ?? []).length > 0;
  const hasPrivateOffering = (privateServiceCount ?? 0) > 0;
  const isBookable = hasUpcomingSession || (hasCalendar && hasPrivateOffering);

  const steps = computeActivationSteps({
    profileComplete: isProfileComplete(athlete),
    hasRateCard,
    hasCalendar,
    isBookable,
    coachId,
  });
  const coreComplete = isCoreActivationComplete(steps);

  const upcomingPublicCount = (upcomingSessions ?? []).filter(
    (s) => (s as { join_policy?: string | null }).join_policy === 'public'
  ).length;

  const showNudges = shouldShowSlotNudges({
    hasCalendar,
    upcomingPublicSessionCount: upcomingPublicCount,
  });

  const slotNudges = showNudges
    ? suggestOpenSlots({
        weeklyWindows: (weeklyWindows ?? []) as {
          day_of_week: number;
          start_time: string;
          end_time: string;
        }[],
        upcomingSessions: (upcomingSessions ?? []) as {
          scheduled_datetime: string;
          duration_minutes?: number | null;
        }[],
        now: new Date(nowIso),
      })
    : [];

  const showPanel = !coreComplete || slotNudges.length > 0;

  return {
    steps,
    coreComplete,
    showPanel,
    slotNudges,
    bookingUrl: `/book/${coachId}`,
  };
}
