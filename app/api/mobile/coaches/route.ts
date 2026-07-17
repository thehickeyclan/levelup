import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import {
  fetchCoachReviewStatsMap,
  mergeCoachReviewStatsIntoAthlete,
  sortAthletesForBrowse,
} from '@/lib/coach-review-stats';

type CoachRow = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  photo_url: string | null;
  photo_focus_x?: number | null;
  photo_focus_y?: number | null;
  weight_class: string | null;
  year: string | null;
  bio: string | null;
  average_rating: number | null;
  review_count: number | null;
  total_sessions: number | null;
  active: boolean;
};

/** Parent app: list active coaches for Find / book. */
export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: athletes, error } = await supabase
      .from('athletes')
      .select(
        'id, first_name, last_name, school, photo_url, photo_focus_x, photo_focus_y, weight_class, year, bio, average_rating, review_count, total_sessions, active'
      )
      .eq('active', true)
      .order('average_rating', { ascending: false, nullsFirst: true })
      .order('school', { ascending: true });

    if (error) {
      console.error('mobile coaches GET:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = ((athletes ?? []) as CoachRow[]).map((a) => ({
      ...a,
      school: a.school ?? '',
    }));
    const reviewStatsMap = await fetchCoachReviewStatsMap(
      supabase,
      list.map((a) => a.id)
    );
    const coaches = sortAthletesForBrowse(
      list.map((a) => mergeCoachReviewStatsIntoAthlete(a, reviewStatsMap))
    ).map((a) => ({
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      school: a.school,
      photo_url: a.photo_url,
      weight_class: a.weight_class,
      year: a.year,
      bio: a.bio,
      average_rating: a.average_rating,
      review_count: a.review_count,
      total_sessions: a.total_sessions,
    }));

    return NextResponse.json({ coaches });
  } catch (e) {
    console.error('mobile coaches:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
