import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getThreadUnreadCount } from '@/lib/guild-messaging';

async function canAccessThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string
): Promise<boolean> {
  const { data: thread } = await supabase
    .from('guild_threads')
    .select('id, is_public, participant_ids')
    .eq('id', threadId)
    .maybeSingle();

  if (!thread) return false;
  if (thread.is_public) return true;
  return ((thread.participant_ids as string[]) ?? []).includes(userId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userData?.role === 'admin';

  if (!isAdmin) {
    const allowed = await canAccessThread(supabase, threadId, user.id);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { loadThreadMessages } = await import('@/lib/guild-messaging');
  const admin = createAdminClient(tenant.slug);
  const messages = await loadThreadMessages(supabase, threadId, { nameClient: admin });
  const unread = await getThreadUnreadCount(supabase, threadId, user.id);

  // Marketplace threads: surface which shoe the conversation is about, so
  // clients can pin a listing card above the messages.
  let listing: { id: string; title: string; image_url: string | null } | null = null;
  try {
    const { data: threadRow } = await admin
      .from('guild_threads')
      .select('listing_id, offer_id, order_id')
      .eq('id', threadId)
      .maybeSingle();
    let listingId = threadRow?.listing_id as string | null;
    if (!listingId && threadRow?.offer_id) {
      const { data: offer } = await admin
        .from('market_offers')
        .select('listing_id')
        .eq('id', threadRow.offer_id)
        .maybeSingle();
      listingId = (offer?.listing_id as string | null) ?? null;
    }
    if (!listingId && threadRow?.order_id) {
      const { data: order } = await admin
        .from('market_orders')
        .select('listing_id')
        .eq('id', threadRow.order_id)
        .maybeSingle();
      listingId = (order?.listing_id as string | null) ?? null;
    }
    if (listingId) {
      const { data: l } = await admin
        .from('market_listings')
        .select(
          'id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order)'
        )
        .eq('id', listingId)
        .maybeSingle();
      if (l) {
        const images = (l.market_listing_images ?? []) as {
          public_url: string | null;
          clean_public_url: string | null;
          use_clean: boolean | null;
          display_order: number | null;
        }[];
        const primary = [...images].sort(
          (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
        )[0];
        listing = {
          id: l.id as string,
          title: (l.title as string) || [l.brand, l.model].filter(Boolean).join(' '),
          image_url:
            (primary?.use_clean && primary?.clean_public_url
              ? primary.clean_public_url
              : primary?.public_url) ?? null,
        };
      }
    }
  } catch (e) {
    console.warn('Thread listing context failed (non-fatal):', e);
  }

  return NextResponse.json({ messages, unread, listing });
}
