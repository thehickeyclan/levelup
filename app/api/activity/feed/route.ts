import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import {
  fetchActivityFeed,
  resolveFeedContext,
} from '@/lib/activity-feed/fetch-feed';
import { resolveCoachScopeForFeed } from '@/lib/activity-feed/resolve-coach-scope';
import type { ActivityFeedScope } from '@/lib/activity-feed/types';

const SCOPES = new Set<ActivityFeedScope>(['community', 'family', 'coach']);

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role ?? 'parent';
  if (!['parent', 'coach', 'youth_wrestler', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = req.nextUrl;
  const scopeParam = (url.searchParams.get('scope') ?? 'community') as ActivityFeedScope;
  const scope = SCOPES.has(scopeParam) ? scopeParam : 'community';
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const cursor = url.searchParams.get('cursor');

  const effectiveRole = role === 'admin' ? 'parent' : role;
  const cookieStore = await cookies();
  const viewAsCoachId =
    role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;

  const ctx = await resolveFeedContext(supabase, user.id, effectiveRole);
  const coachScope = resolveCoachScopeForFeed({
    role,
    userId: user.id,
    scope,
    viewAsCoachId: viewAsCoachId ?? url.searchParams.get('coachId'),
  });
  const feedDb = coachScope.useAdminClient ? createAdminClient(tenant.slug) : supabase;

  const { posts, nextCursor } = await fetchActivityFeed(feedDb, user.id, {
    scope,
    limit,
    cursor,
    coachId: coachScope.coachId,
    youthWrestlerIds: ctx.youthWrestlerIds,
  });

  return NextResponse.json({ posts, nextCursor });
}
