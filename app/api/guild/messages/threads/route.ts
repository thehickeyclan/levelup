import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { ensureSessionGuildThreadForParticipants } from '@/lib/guild-messaging';

/**
 * GET /api/guild/messages/threads?session_id=<id>
 * Returns the caller's chat thread for a session they coach or booked,
 * creating it if needed. Empty session threads are hidden from the inbox,
 * so session screens use this to open the chat directly.
 */
export async function GET(req: Request) {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient(tenant.slug);
  const { data: session } = await admin
    .from('sessions')
    .select('id, athlete_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const coachId = (session.athlete_id as string | null) ?? null;
  const { data: participants } = await admin
    .from('session_participants')
    .select('parent_id')
    .eq('session_id', sessionId)
    .eq('paid', true);
  const parentIds = [...new Set((participants ?? []).map((p) => p.parent_id as string).filter(Boolean))];

  const isCoach = coachId === user.id;
  if (!isCoach && !parentIds.includes(user.id)) {
    return NextResponse.json({ error: 'Not on this session' }, { status: 403 });
  }

  const threadId = await ensureSessionGuildThreadForParticipants(
    admin,
    tenant.slug,
    sessionId,
    [coachId, ...parentIds].filter((id): id is string => Boolean(id))
  );
  if (!threadId) return NextResponse.json({ error: 'Could not open thread' }, { status: 500 });

  return NextResponse.json({ id: threadId });
}
