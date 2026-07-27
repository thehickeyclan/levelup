import { apiFetch } from './api';

export type CoachAthleteSession = {
  id: string;
  scheduledDatetime: string;
  status: string;
  sessionType: string | null;
  focusArea: string | null;
  facilityName: string | null;
};

export type CoachAthlete = {
  id: string;
  parentId: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  age: number | null;
  weightClass: string | null;
  skillLevel: string | null;
  graduationYear: number | null;
  school: string | null;
  sessionsWithCoach: number;
  completedGuildSessions: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  history: CoachAthleteSession[];
};

export const GUILD_SESSION_MILESTONES = [10, 25, 50, 100] as const;

export function milestoneFor(sessionCount: number) {
  const earned =
    [...GUILD_SESSION_MILESTONES].reverse().find((milestone) => sessionCount >= milestone) ?? null;
  const next =
    GUILD_SESSION_MILESTONES.find((milestone) => sessionCount < milestone) ?? null;
  const previous = earned ?? 0;
  const progress =
    next == null ? 1 : Math.max(0, Math.min(1, (sessionCount - previous) / (next - previous)));
  return { earned, next, progress };
}

export async function fetchCoachAthletes(athleteId?: string): Promise<CoachAthlete[]> {
  const suffix = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
  const data = await apiFetch<{ athletes?: CoachAthlete[] }>(
    `/api/mobile/coach/athletes${suffix}`
  );
  return data.athletes ?? [];
}
