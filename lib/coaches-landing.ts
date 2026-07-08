import { createAdminClient } from '@/lib/supabase/admin';
import { coachPayoutFromParentPrice } from '@/lib/pricing';

export type CoachesLandingCoach = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  photoFocusX?: number | null;
  photoFocusY?: number | null;
  school: string;
  schoolLabel: string;
  weightClass: string | null;
  year: string | null;
  sessionCount: number;
};

export type CoachesBySchool = {
  schoolLabel: string;
  sortOrder: number;
  coaches: CoachesLandingCoach[];
};

export type CoachesLandingStats = {
  coachCount: number;
  sessionCount: number;
};

export type CoachesEarningsExample = {
  title: string;
  subtitle: string;
  parentTotal: number;
  coachKeeps: number;
};

const SCHOOL_SORT: Record<string, number> = {
  UNC: 1,
  'NC State': 2,
  NCSU: 2,
  'North Carolina State': 2,
  'App State': 3,
  'Appalachian State': 3,
  'Appalachian State University': 3,
};

export function normalizeSchoolLabel(school: string): string {
  const s = school.trim();
  if (s === 'NCSU' || s === 'North Carolina State') return 'NC State';
  if (s === 'Appalachian State' || s === 'Appalachian State University') return 'App State';
  return s;
}

function schoolSortOrder(label: string): number {
  return SCHOOL_SORT[label] ?? 99;
}

export function buildCoachesEarningsExamples(pricing: {
  oneOnOne: number;
  twoAthlete: number;
  groupRate: number;
}): CoachesEarningsExample[] {
  const partnerPerAthlete = pricing.twoAthlete / 2;
  const groupSize = 6;
  const groupTotal = pricing.groupRate * groupSize;

  return [
    {
      title: 'Private',
      subtitle: `$${pricing.oneOnOne}/session`,
      parentTotal: pricing.oneOnOne,
      coachKeeps: coachPayoutFromParentPrice(pricing.oneOnOne),
    },
    {
      title: 'Partner',
      subtitle: `2 athletes · $${partnerPerAthlete} each`,
      parentTotal: pricing.twoAthlete,
      coachKeeps: coachPayoutFromParentPrice(pricing.twoAthlete),
    },
    {
      title: 'Small Group',
      subtitle: `${groupSize} athletes · $${pricing.groupRate} each`,
      parentTotal: groupTotal,
      coachKeeps: coachPayoutFromParentPrice(groupTotal),
    },
  ];
}

export async function fetchCoachesLandingData(tenantSlug: string): Promise<{
  coaches: CoachesLandingCoach[];
  bySchool: CoachesBySchool[];
  stats: CoachesLandingStats;
  heroCoachIds: string[];
}> {
  const admin = createAdminClient(tenantSlug);

  const [coachesRes, sessionsRes] = await Promise.all([
    admin
      .from('athletes')
      .select(
        'id, first_name, last_name, photo_url, photo_focus_x, photo_focus_y, school, weight_class, year, total_sessions'
      )
      .eq('active', true)
      .not('photo_url', 'is', null)
      .order('total_sessions', { ascending: false, nullsFirst: false }),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
  ]);

  const rows = coachesRes.data ?? [];
  const coaches: CoachesLandingCoach[] = rows.map((c) => {
    const school = (c.school as string) ?? '';
    return {
      id: c.id as string,
      firstName: c.first_name as string,
      lastName: c.last_name as string,
      photoUrl: c.photo_url as string,
      photoFocusX: c.photo_focus_x as number | null | undefined,
      photoFocusY: c.photo_focus_y as number | null | undefined,
      school,
      schoolLabel: normalizeSchoolLabel(school),
      weightClass: (c.weight_class as string | null) ?? null,
      year: (c.year as string | null) ?? null,
      sessionCount: Number(c.total_sessions) || 0,
    };
  });

  const bySchoolMap = new Map<string, CoachesLandingCoach[]>();
  for (const coach of coaches) {
    const bucket = bySchoolMap.get(coach.schoolLabel) ?? [];
    bucket.push(coach);
    bySchoolMap.set(coach.schoolLabel, bucket);
  }

  const bySchool: CoachesBySchool[] = Array.from(bySchoolMap.entries())
    .map(([schoolLabel, schoolCoaches]) => ({
      schoolLabel,
      sortOrder: schoolSortOrder(schoolLabel),
      coaches: schoolCoaches.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      ),
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.schoolLabel.localeCompare(b.schoolLabel);
    });

  const heroCoachIds = coaches.slice(0, 5).map((c) => c.id);

  return {
    coaches,
    bySchool,
    stats: {
      coachCount: coaches.length,
      sessionCount: sessionsRes.count ?? 0,
    },
    heroCoachIds,
  };
}
