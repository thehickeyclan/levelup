import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { ensureCoachInquiryThread } from '@/lib/guild-coach-inquiry';
import { coachMayMessageUser } from '@/lib/coach-message-contacts';
import { resolveCoachActorId } from '@/lib/coach-actor-server';
import { canonicalCoachConversationPair } from '@/lib/coach-peer-message';

/** POST { coachUserId } (parent/athlete/coach) or { parentId } (coach) — open/create DM. */
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    coachUserId?: string;
    parentId?: string;
  };

  const { data: caller } = await supabase.from('users').select('role').eq('id', user.id).single();
  const callerRole = caller?.role;

  let parentId: string;
  let coachUserId: string;
  let requestedCoachUserId: string | null = null;

  if (body.coachUserId) {
    requestedCoachUserId = body.coachUserId;
    coachUserId = requestedCoachUserId;
    if (callerRole === 'coach' || callerRole === 'admin') {
      const actor = await resolveCoachActorId(supabase, user.id);
      if (!actor.ok) {
        return NextResponse.json({ error: actor.error }, { status: actor.status });
      }
      if (actor.coachId === requestedCoachUserId) {
        return NextResponse.json({ error: 'You cannot message yourself' }, { status: 400 });
      }
      // Canonicalize coach pairs so either coach opens the same conversation.
      [parentId, coachUserId] = canonicalCoachConversationPair(
        actor.coachId,
        requestedCoachUserId
      );
    } else {
      parentId = user.id;
    }
  } else if (body.parentId) {
    parentId = body.parentId;
    if (callerRole !== 'coach' && callerRole !== 'admin') {
      return NextResponse.json({ error: 'Only coaches can start this conversation' }, { status: 403 });
    }
    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }
    coachUserId = actor.coachId;
  } else {
    return NextResponse.json({ error: 'Missing coachUserId or parentId' }, { status: 400 });
  }

  if (
    body.coachUserId &&
    callerRole !== 'coach' &&
    callerRole !== 'admin' &&
    user.id !== parentId
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body.coachUserId) {
    if (
      callerRole !== 'parent' &&
      callerRole !== 'youth_wrestler' &&
      callerRole !== 'coach' &&
      callerRole !== 'admin'
    ) {
      return NextResponse.json({ error: 'This account cannot start a coach conversation' }, { status: 403 });
    }
    const { data: coach } = await supabase
      .from('athletes')
      .select('id, active')
      .eq('id', requestedCoachUserId ?? coachUserId)
      .maybeSingle();
    if (!coach?.id || coach.active === false) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }
    if (parentId === coachUserId) {
      return NextResponse.json({ error: 'You cannot message yourself' }, { status: 400 });
    }
  }

  // Coach initiating a DM: only parents/kids from their session history (ever)
  if (body.parentId) {
    if (callerRole === 'coach' || callerRole === 'admin') {
      const admin = createAdminClient(tenant.slug);
      const allowed = await coachMayMessageUser(admin, coachUserId, parentId);
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              'You can only message parents and athletes who have registered for your sessions.',
          },
          { status: 403 }
        );
      }
    }
  }

  try {
    const admin = createAdminClient(tenant.slug);
    const threadId = await ensureCoachInquiryThread(admin, tenant.slug, parentId, coachUserId);
    return NextResponse.json({ threadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not open conversation';
    console.error('coach-inquiry thread error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
