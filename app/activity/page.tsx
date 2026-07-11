import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchActivityFeed, resolveFeedContext } from '@/lib/activity-feed/fetch-feed';
import { resolveCoachScopeForFeed } from '@/lib/activity-feed/resolve-coach-scope';
import type { ActivityFeedScope } from '@/lib/activity-feed/types';
import { ActivityPageShell } from '@/components/activity/activity-page-shell';

export const dynamic = 'force-dynamic';

const SCOPES = new Set<ActivityFeedScope>(['community', 'family', 'coach']);

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  const scopeParam = (sp.scope ?? 'community') as ActivityFeedScope;
  const scope = SCOPES.has(scopeParam) ? scopeParam : 'community';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role ?? 'parent';
  const effectiveRole = role === 'admin' ? 'parent' : role;

  const cookieStore = await cookies();
  const viewAsCoachId =
    role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;

  const ctx = await resolveFeedContext(supabase, user.id, effectiveRole);
  const coachScope = resolveCoachScopeForFeed({
    role,
    userId: user.id,
    scope,
    viewAsCoachId,
  });
  const feedDb = createAdminClient(tenant.slug);

  const { posts } = await fetchActivityFeed(feedDb, user.id, {
    scope,
    limit: 30,
    coachId: coachScope.coachId,
    youthWrestlerIds: ctx.youthWrestlerIds,
    photoActor: {
      userId: user.id,
      role,
      coachId: role === 'coach' ? user.id : viewAsCoachId ?? null,
    },
  });

  const title =
    scope === 'family'
      ? 'Family activity'
      : scope === 'coach'
        ? 'Your session activity'
        : 'Guild activity';

  const description =
    scope === 'family'
      ? 'Sessions, milestones, and photos from your wrestlers.'
      : scope === 'coach'
        ? 'Activity on your sessions — completions, photos, and milestones.'
        : 'Sessions completed, photos shared, and milestones across Guild.';

  const emptyMessage =
    scope === 'coach' && role === 'admin' && !viewAsCoachId
      ? 'Choose a coach in the header (preview as coach), then open this page again.'
      : posts.length === 0
        ? 'No activity yet. When sessions are marked complete — or you share photos with + — they show up here.'
        : undefined;

  return (
    <ActivityPageShell
      title={title}
      description={description}
      posts={posts}
      role={role}
      highlightCoachHammers={scope === 'coach'}
      showShareButton={!(scope === 'coach' && role === 'admin' && !viewAsCoachId)}
      emptyMessage={emptyMessage}
    />
  );
}
