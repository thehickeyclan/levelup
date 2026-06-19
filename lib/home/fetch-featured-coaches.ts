import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCoachReviewStatsMap, getCoachReviewStatsForId } from '@/lib/coach-review-stats';

export type FeaturedCoachStrip = {
  id: string;
  firstName: string;
  photoUrl: string;
  school: string;
  photoFocusX?: number | null;
  photoFocusY?: number | null;
};

export type FeaturedCoachCard = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  photoFocusX?: number | null;
  photoFocusY?: number | null;
  school: string;
  weightClass: string | null;
  year: string | null;
  averageRating: number;
  reviewCount: number;
  sessionCount: number;
  featuredReview: string | null;
};

type AthleteRow = {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  photo_focus_x?: number | null;
  photo_focus_y?: number | null;
  school: string;
  weight_class: string | null;
  year: string | null;
  total_sessions?: number | null;
};

/** Top coaches for hero photo strip — faces + school badges only. */
export async function fetchFeaturedCoachesForHome(
  tenantSlug: string,
  limit = 8
): Promise<FeaturedCoachStrip[]> {
  const admin = createAdminClient(tenantSlug);

  const { data: coaches, error } = await admin
    .from('athletes')
    .select('id, first_name, photo_url, photo_focus_x, photo_focus_y, school, total_sessions')
    .eq('active', true)
    .not('photo_url', 'is', null)
    .order('total_sessions', { ascending: false, nullsFirst: false });

  if (error || !coaches?.length) return [];

  const ids = coaches.map((c) => c.id as string);
  const reviewStatsMap = await fetchCoachReviewStatsMap(admin, ids);

  const ranked = [...(coaches as AthleteRow[])].sort((a, b) => {
    const ra = getCoachReviewStatsForId(reviewStatsMap, a.id).review_count;
    const rb = getCoachReviewStatsForId(reviewStatsMap, b.id).review_count;
    if (rb !== ra) return rb - ra;
    return (b.total_sessions ?? 0) - (a.total_sessions ?? 0);
  });

  return ranked.slice(0, limit).map((c) => ({
    id: c.id,
    firstName: c.first_name,
    photoUrl: c.photo_url,
    school: c.school,
    photoFocusX: c.photo_focus_x,
    photoFocusY: c.photo_focus_y,
  }));
}

/** Coaches with ratings, session counts, and a parent review snippet for Section 2. */
export async function fetchFeaturedCoachesWithReviews(
  tenantSlug: string,
  limit = 12
): Promise<FeaturedCoachCard[]> {
  const admin = createAdminClient(tenantSlug);

  const { data: coaches, error } = await admin
    .from('athletes')
    .select(
      'id, first_name, last_name, photo_url, photo_focus_x, photo_focus_y, school, weight_class, year, total_sessions'
    )
    .eq('active', true)
    .not('photo_url', 'is', null);

  if (error || !coaches?.length) return [];

  const ids = coaches.map((c) => c.id as string);
  const reviewStatsMap = await fetchCoachReviewStatsMap(admin, ids);

  const withReviews = (coaches as AthleteRow[]).filter(
    (c) => getCoachReviewStatsForId(reviewStatsMap, c.id).review_count > 0
  );
  if (!withReviews.length) return [];

  const { data: reviewRows } = await admin
    .from('reviews_anonymous')
    .select('athlete_id, rating, comment, created_at')
    .in('athlete_id', withReviews.map((c) => c.id))
    .gte('rating', 4)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false });

  const featuredReviewByCoach = new Map<string, string>();
  for (const row of reviewRows ?? []) {
    const aid = row.athlete_id as string;
    if (featuredReviewByCoach.has(aid)) continue;
    const comment = (row.comment as string | null)?.trim();
    if (comment) featuredReviewByCoach.set(aid, comment);
  }

  const ranked = withReviews.sort((a, b) => {
    const sa = getCoachReviewStatsForId(reviewStatsMap, a.id);
    const sb = getCoachReviewStatsForId(reviewStatsMap, b.id);
    if (sb.review_count !== sa.review_count) return sb.review_count - sa.review_count;
    return sb.average_rating - sa.average_rating;
  });

  return ranked.slice(0, limit).map((c) => {
    const stats = getCoachReviewStatsForId(reviewStatsMap, c.id);
    return {
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      photoUrl: c.photo_url,
      photoFocusX: c.photo_focus_x,
      photoFocusY: c.photo_focus_y,
      school: c.school,
      weightClass: c.weight_class,
      year: c.year,
      averageRating: stats.average_rating,
      reviewCount: stats.review_count,
      sessionCount: c.total_sessions ?? 0,
      featuredReview: featuredReviewByCoach.get(c.id) ?? null,
    };
  });
}
