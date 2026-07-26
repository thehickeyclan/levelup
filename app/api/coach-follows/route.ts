import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { fetchCoachReviewStatsMap, mergeCoachReviewStatsIntoAthlete } from '@/lib/coach-review-stats';

export async function GET(req: NextRequest) {
  try {
    const host = (await headers()).get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!['parent', 'youth_wrestler', 'admin'].includes(userData?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabase
      .from('coach_follows')
      .select('coach_id, created_at, athletes(id, first_name, last_name, school, photo_url, average_rating, review_count)')
      .eq('parent_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<{
      coach_id: string;
      created_at: string;
      athletes?: { id: string; first_name: string; last_name: string; school: string; photo_url?: string; average_rating?: number | null; review_count?: number | null } | { id: string; first_name: string; last_name: string; school: string; photo_url?: string; average_rating?: number | null; review_count?: number | null }[];
    }>;
    const coachIds = rows.map((f) => f.coach_id).filter(Boolean);
    const reviewStatsMap = await fetchCoachReviewStatsMap(supabase, coachIds);
    const follows = rows.map((f) => {
      const a = Array.isArray(f.athletes) ? f.athletes[0] : f.athletes;
      const merged = a ? mergeCoachReviewStatsIntoAthlete(a, reviewStatsMap) : null;
      return {
        coachId: f.coach_id,
        followedAt: f.created_at,
        coach: merged
          ? {
              id: merged.id,
              firstName: merged.first_name,
              lastName: merged.last_name,
              school: merged.school,
              photoUrl: merged.photo_url,
              averageRating: merged.average_rating ?? null,
              reviewCount: merged.review_count ?? null,
            }
          : null,
      };
    });
    return NextResponse.json({ follows });
  } catch (e) {
    console.error('Coach follows GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const host = (await headers()).get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!['parent', 'youth_wrestler', 'admin'].includes(userData?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await req.json()) as { coachId?: string };
    const coachId = body?.coachId;
    if (!coachId || typeof coachId !== 'string') {
      return NextResponse.json({ error: 'Missing coachId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('coach_follows')
      .upsert(
        { parent_id: user.id, coach_id: coachId },
        { onConflict: 'parent_id,coach_id' }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: coach } = await supabase
      .from('athletes')
      .select('first_name, last_name')
      .eq('id', coachId)
      .maybeSingle();
    const coachName = coach
      ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim()
      : '';

    return NextResponse.json({ success: true, coachName });
  } catch (e) {
    console.error('Coach follows POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const host = (await headers()).get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (!['parent', 'youth_wrestler', 'admin'].includes(userData?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    if (!coachId) return NextResponse.json({ error: 'Missing coachId' }, { status: 400 });

    const { error } = await supabase
      .from('coach_follows')
      .delete()
      .eq('parent_id', user.id)
      .eq('coach_id', coachId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Coach follows DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
