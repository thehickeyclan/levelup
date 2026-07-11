import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { sendCoachNewReviewSms } from '@/lib/twilio';
import { attachReviewToSessionCompletedActivityPost } from '@/lib/activity-feed/create-posts';
import { checkReviewRewardForSession, isRewardsProgramEnabled } from '@/lib/rewards';

const REVIEW_TAGS = ['Technique', 'Great with kids', 'Punctual', 'Communication', 'My kid loved it'] as const;

/** GET /api/reviews?athleteId=xxx — list for coach. GET ?featured=true — for homepage (rating>=4, has comment) */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const athleteId = searchParams.get('athleteId');
    const featured = searchParams.get('featured') === 'true';

    const supabase = await createClient(tenant.slug);

    if (featured) {
      const { data, error } = await supabase
        .from('reviews_anonymous')
        .select('id, athlete_id, rating, comment, created_at')
        .gte('rating', 4)
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) {
        console.error('Reviews featured fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const reviews = data ?? [];
      const athleteIds = [...new Set(reviews.map((r) => r.athlete_id))];
      const { data: athletes } = athleteIds.length > 0
        ? await supabase.from('athletes').select('id, first_name, last_name').in('id', athleteIds)
        : { data: [] };
      const coachById = new Map((athletes ?? []).map((a) => [a.id, a]));
      const withCoach = reviews.map((r) => ({
        ...r,
        coach_name: coachById.get(r.athlete_id)
          ? `${(coachById.get(r.athlete_id) as { first_name: string; last_name: string }).first_name} ${(coachById.get(r.athlete_id) as { first_name: string; last_name: string }).last_name}`
          : 'Coach',
      }));
      return NextResponse.json({ reviews: withCoach });
    }

    if (!athleteId) return NextResponse.json({ error: 'athleteId or featured required' }, { status: 400 });

    const { data, error } = await supabase
      .from('reviews_anonymous')
      .select('id, session_id, athlete_id, rating, comment, tags, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Reviews fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      reviews: data ?? [],
      tagOptions: REVIEW_TAGS,
    });
  } catch (e) {
    console.error('Reviews GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/reviews — upsert review for this session (unique session_id + parent_id). */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sessionId = body.sessionId ?? body.session_id;
    const rating = body.rating != null ? Number(body.rating) : NaN;
    const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 5)
      : [];

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 });
    }
    if (comment && comment.length > 500) {
      return NextResponse.json({ error: 'Comment must be 500 characters or less' }, { status: 400 });
    }

    // Load session and verify completed + parent is owner or participant (same logic as review page: admin-based so multi-kid + RLS don't block)
    const admin = createAdminClient(tenant.slug);
    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('id, parent_id, athlete_id, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.status !== 'completed') {
      return NextResponse.json({ error: 'Can only review completed sessions' }, { status: 400 });
    }

    const isOwner = session.parent_id === user.id;
    let isParticipant = false;
    if (!isOwner) {
      const { data: participants } = await admin
        .from('session_participants')
        .select('youth_wrestler_id, parent_id')
        .eq('session_id', sessionId);
      const rows = participants ?? [];
      const hasRowAsParent = rows.some((r: { parent_id?: string | null }) => r.parent_id === user.id);
      if (hasRowAsParent) {
        isParticipant = true;
      } else {
        const youthIds = rows.map((r: { youth_wrestler_id: string | null }) => r.youth_wrestler_id).filter(Boolean) as string[];
        if (youthIds.length > 0) {
          const { data: youthRows } = await admin
            .from('youth_wrestlers')
            .select('id')
            .in('id', youthIds)
            .eq('parent_id', user.id)
            .limit(1);
          if (youthRows && youthRows.length > 0) isParticipant = true;
          if (!isParticipant) {
            const { data: linked } = await admin
              .from('youth_wrestler_parents')
              .select('youth_wrestler_id')
              .in('youth_wrestler_id', youthIds)
              .eq('parent_id', user.id)
              .limit(1);
            if (linked && linked.length > 0) isParticipant = true;
          }
        }
      }
    }
    if (!isOwner && !isParticipant) {
      return NextResponse.json({ error: 'You did not participate in this session' }, { status: 403 });
    }

    const coachId = session.athlete_id as string;
    if (!coachId) {
      return NextResponse.json({ error: 'Session has no coach' }, { status: 400 });
    }

    const { data: priorReview } = await admin
      .from('reviews')
      .select('id')
      .eq('session_id', sessionId)
      .eq('parent_id', user.id)
      .maybeSingle();
    const isFirstReviewForSession = !priorReview;

    const row = {
      session_id: sessionId,
      parent_id: user.id,
      athlete_id: session.athlete_id,
      rating,
      comment: comment || null,
      tags: tags.length > 0 ? tags : null,
    };

    // Use service role for write: RLS INSERT only allows organizer or session_participants.parent_id,
    // but participation includes linked parents (youth_wrestler_parents) validated above — same pattern as eligibility checks.
    const { data: review, error: upsertError } = await admin
      .from('reviews')
      .upsert(row, {
        onConflict: 'session_id,parent_id',
        ignoreDuplicates: false,
      })
      .select('id, rating, comment, tags, created_at')
      .single();

    if (upsertError) {
      console.error('Review upsert error:', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    if (isFirstReviewForSession) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (host.startsWith('localhost') ? `http://${host}` : `https://${host}`);
      const profileUrl = `${baseUrl.replace(/\/$/, '')}/athlete/${coachId}`;
      void sendCoachNewReviewSms(admin, coachId, rating, profileUrl).catch((err) =>
        console.warn('Coach new review SMS failed:', err)
      );
    }

    if (isRewardsProgramEnabled() && isFirstReviewForSession) {
      await checkReviewRewardForSession(admin, {
        tenantSlug: tenant.slug,
        parentId: user.id,
        sessionId,
      });
    }

    void attachReviewToSessionCompletedActivityPost(admin, {
      sessionId,
      parentId: user.id,
      reviewId: review.id as string,
    }).catch((err) => console.warn('Activity review attach failed:', err));

    return NextResponse.json({ review });
  } catch (e) {
    console.error('Reviews POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
