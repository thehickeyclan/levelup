import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { fetchActivityFeed, resolveFeedContext } from '@/lib/activity-feed/fetch-feed';
import type { ActivityFeedScope } from '@/lib/activity-feed/types';
import { ActivityFeedList } from '@/components/activity/activity-feed-list';

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

  const ctx = await resolveFeedContext(supabase, user.id, effectiveRole);
  const coachId = scope === 'coach' && effectiveRole === 'coach' ? user.id : ctx.coachId;

  const { posts } = await fetchActivityFeed(supabase, user.id, {
    scope,
    limit: 30,
    coachId,
    youthWrestlerIds: ctx.youthWrestlerIds,
  });

  const title =
    scope === 'family'
      ? 'Family activity'
      : scope === 'coach'
        ? 'Your session activity'
        : 'Guild activity';

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
        Sessions completed and milestones across Guild.
      </p>
      <div className="mt-6">
        <ActivityFeedList posts={posts} highlightCoachKudos={scope === 'coach'} />
      </div>
    </div>
  );
}
