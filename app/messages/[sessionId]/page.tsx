import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import { BackLink } from '@/components/back-link';
import { MessageThread } from '@/components/guild/message-thread';
import {
  ensureSessionGuildThreadForParticipants,
  findThreadIdByContext,
} from '@/lib/guild-messaging';
import { getSessionMessageAccess } from '@/lib/session-message-access';
import { IN_APP_MESSAGING_ENABLED } from '@/lib/in-app-messaging';

export default async function SessionMessagesPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');
  if (!IN_APP_MESSAGING_ENABLED) redirect('/bookings');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const access = await getSessionMessageAccess(supabase, sessionId, user.id);
  if (!access.allowed) notFound();

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('id, parent_id, athlete_id, scheduled_datetime, athletes(id, first_name, last_name, school), facilities(name)')
    .eq('id', sessionId)
    .single();

  if (sessErr || !session) notFound();

  const admin = createAdminClient(tenant.slug);
  await ensureSessionGuildThreadForParticipants(admin, tenant.slug, sessionId, access.participantIds);

  let threadId = await findThreadIdByContext(supabase, 'session', { sessionId });
  if (!threadId) {
    threadId = await ensureSessionGuildThreadForParticipants(
      admin,
      tenant.slug,
      sessionId,
      access.participantIds
    );
  }
  if (!threadId) notFound();

  const coach = session.athletes;
  const coachObj = Array.isArray(coach) ? coach[0] : coach;
  const coachName = coachObj
    ? `${(coachObj as { first_name?: string }).first_name ?? ''} ${(coachObj as { last_name?: string }).last_name ?? ''}`.trim()
    : 'Coach';
  const dateStr = formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d, yyyy h:mm a');
  const isCoach = session.athlete_id === user.id;
  const backHref = isCoach ? '/athlete-dashboard' : '/bookings';
  const backLabel = isCoach ? 'Back to schedule' : 'Back to bookings';

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl pb-24">
      <div className="mb-6 space-y-2">
        <BackLink fallbackHref={backHref} label={backLabel} />
        <h1 className="text-xl font-bold text-foreground">Session messages</h1>
        <p className="text-sm text-muted-foreground">
          {coachName} · {dateStr}
        </p>
        <Link href="/messages" className="text-xs text-accent hover:underline">
          All messages
        </Link>
      </div>
      <MessageThread
        threadId={threadId}
        currentUserId={user.id}
        showSenderName
        placeholder="Message about this session…"
        maxHeight="420px"
      />
    </div>
  );
}
