import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import { getThreadUnreadCount } from '@/lib/guild-messaging';
import { MESSAGES_HOME_PATH } from '@/lib/in-app-messaging';

const THREAD_ICONS: Record<string, string> = {
  trade: '📦',
  order: '🛒',
  offer: '💬',
  listing_qa: '❓',
  session: '🎯',
  coach_inquiry: '💬',
  session_change: '🎯',
  group_session: '👥',
};

function threadLabel(threadType: string, title: string | null): string {
  const prefix = THREAD_ICONS[threadType] ?? '💬';
  if (title) return `${prefix} ${title}`;
  switch (threadType) {
    case 'trade':
      return `${prefix} Trade`;
    case 'order':
      return `${prefix} Order`;
    case 'offer':
      return `${prefix} Offer`;
    case 'listing_qa':
      return `${prefix} Listing Q&A`;
    case 'session':
      return `${prefix} Session`;
    case 'coach_inquiry':
      return `${prefix} Coach message`;
    case 'group_session':
      return `${prefix} Group session`;
    default:
      return `${prefix} Message`;
  }
}

export async function GET() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient(tenant.slug);

  const { data: threads, error: threadsError } = await admin
    .from('guild_threads')
    .select(`
      id, thread_type, listing_id, offer_id, trade_id, order_id, session_id,
      participant_ids, created_at,
      market_listings(brand, model, title),
      market_offers(id),
      market_trades(id),
      market_orders(order_ref)
    `)
    .contains('participant_ids', [user.id])
    .order('created_at', { ascending: false })
    .limit(80);

  if (threadsError) {
    console.error('guild inbox threads error:', threadsError);
    return NextResponse.json({ error: threadsError.message }, { status: 500 });
  }

  const rows = await Promise.all(
    (threads ?? []).map(async (t) => {
      const listing = t.market_listings as { brand?: string; model?: string; title?: string } | null;
      const listingTitle =
        [listing?.brand, listing?.model].filter(Boolean).join(' ') || listing?.title || null;
      const order = t.market_orders as { order_ref?: string } | null;

      let contextTitle: string | null = null;

      if (t.thread_type === 'session' && t.session_id) {
        const { data: sess } = await admin
          .from('sessions')
          .select('scheduled_datetime, athletes(first_name, last_name)')
          .eq('id', t.session_id)
          .maybeSingle();
        const coach = sess?.athletes as { first_name?: string; last_name?: string } | null;
        const coachName = coach
          ? [coach.first_name, coach.last_name].filter(Boolean).join(' ')
          : 'Coach';
        const when = sess?.scheduled_datetime
          ? formatEST(new Date(sess.scheduled_datetime as string), 'MMM d h:mm a')
          : '';
        contextTitle = when ? `${coachName} · ${when}` : coachName;
      } else if (t.thread_type === 'coach_inquiry') {
        const participantIds = ((t.participant_ids as string[]) ?? []).filter((id) => id !== user.id);
        const otherId = participantIds[0];
        if (otherId) {
          const { data: coach } = await admin
            .from('athletes')
            .select('first_name, last_name')
            .eq('id', otherId)
            .maybeSingle();
          if (coach) {
            const coachName = [coach.first_name, coach.last_name].filter(Boolean).join(' ');
            contextTitle = coachName ? `Coach ${coachName}` : 'Coach';
          } else {
            const { data: parentUser } = await admin
              .from('users')
              .select('first_name, last_name, email')
              .eq('id', otherId)
              .maybeSingle();
            contextTitle =
              [parentUser?.first_name, parentUser?.last_name].filter(Boolean).join(' ').trim() ||
              parentUser?.email ||
              'Parent';
          }
        }
      }

      const { data: lastMsg } = await admin
        .from('guild_messages')
        .select('body, created_at')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const unread = await getThreadUnreadCount(admin, t.id as string, user.id);

      let href = `${MESSAGES_HOME_PATH}?thread=${t.id}`;
      if (t.thread_type === 'trade') href = `/market/trade/${t.trade_id}`;
      else if (t.thread_type === 'order') href = `/market/orders/${t.order_id}`;
      else if (t.thread_type === 'offer') href = `/market/offers`;
      else if (t.thread_type === 'listing_qa' && t.listing_id) {
        href = `/market/listing/${t.listing_id}`;
      } else if (t.thread_type === 'session' && t.session_id) {
        href = `/messages/${t.session_id}`;
      }

      return {
        id: t.id as string,
        thread_type: t.thread_type as string,
        label: threadLabel(
          t.thread_type as string,
          t.thread_type === 'order' && order?.order_ref
            ? `Order #${order.order_ref}`
            : contextTitle ?? listingTitle
        ),
        preview: (lastMsg?.body as string) ?? 'No messages yet',
        last_at: (lastMsg?.created_at as string) ?? (t.created_at as string),
        unread,
        href,
      };
    })
  );

  rows.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

  return NextResponse.json({ threads: rows });
}
