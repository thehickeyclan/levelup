import { createAdminClient } from '@/lib/supabase/admin';

export type HomeReview = {
  id: string;
  coachId: string;
  rating: number;
  comment: string;
  coachFirstName: string;
  coachLastName: string;
  coachPhoto: string | null;
  coachSchool: string;
};

export type HomeReviewStats = {
  sessionCount: number;
  coachCount: number;
  stateCount: number;
  avgRating: number;
};

export async function fetchHomeReviews(
  tenantSlug: string,
  limit = 10
): Promise<HomeReview[]> {
  const admin = createAdminClient(tenantSlug);

  const { data: reviews, error } = await admin
    .from('reviews_anonymous')
    .select('id, athlete_id, rating, comment, created_at')
    .gte('rating', 4)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !reviews?.length) return [];

  const filtered = reviews.filter(
    (r) => typeof r.comment === 'string' && r.comment.trim().length > 50
  );
  if (!filtered.length) return [];

  const athleteIds = [...new Set(filtered.map((r) => r.athlete_id as string))];
  const { data: athletes } = await admin
    .from('athletes')
    .select('id, first_name, last_name, photo_url, school')
    .in('id', athleteIds);

  const coachById = new Map(
    (athletes ?? []).map((a) => [
      a.id as string,
      {
        firstName: a.first_name as string,
        lastName: a.last_name as string,
        photo: (a.photo_url as string | null) ?? null,
        school: a.school as string,
      },
    ])
  );

  return filtered.slice(0, limit).map((r) => {
    const coach = coachById.get(r.athlete_id as string);
    return {
      id: r.id as string,
      coachId: r.athlete_id as string,
      rating: r.rating as number,
      comment: (r.comment as string).trim(),
      coachFirstName: coach?.firstName ?? 'Coach',
      coachLastName: coach?.lastName ?? '',
      coachPhoto: coach?.photo ?? null,
      coachSchool: coach?.school ?? '',
    };
  });
}

export async function fetchHomeReviewStats(tenantSlug: string): Promise<HomeReviewStats> {
  const admin = createAdminClient(tenantSlug);

  const [sessionsRes, coachesRes, reviewsRes, facilitiesRes] = await Promise.all([
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
    admin
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('active', true),
    admin.from('reviews_anonymous').select('rating'),
    admin.from('facilities').select('address').not('address', 'is', null),
  ]);

  const sessionCount = sessionsRes.count ?? 0;
  const coachCount = coachesRes.count ?? 0;

  const stateSet = new Set<string>();
  for (const f of facilitiesRes.data ?? []) {
    const addr = (f.address as string | null) ?? '';
    const parts = addr.split(',').map((p) => p.trim());
    const statePart = parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1];
    if (statePart && statePart.length <= 3) {
      stateSet.add(statePart.toUpperCase());
    } else if (statePart) {
      stateSet.add(statePart);
    }
  }
  const stateCount = Math.max(stateSet.size, 1);

  let avgRating = 0;
  const ratings = (reviewsRes.data ?? [])
    .map((r) => Number((r as { rating: number }).rating))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ratings.length > 0) {
    avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  }

  return { sessionCount, coachCount, stateCount, avgRating };
}
