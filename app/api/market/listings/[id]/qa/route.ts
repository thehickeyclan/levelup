import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { findOrCreateThread, sendGuildMessage } from '@/lib/guild-messaging';
import { createNotification } from '@/lib/notifications';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant } = ctx;
  const { id: listingId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, brand, model, title')
    .eq('id', listingId)
    .maybeSingle();

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

  const admin = createAdminClient(tenant.slug);
  const { findThreadIdByContext, loadThreadMessages } = await import('@/lib/guild-messaging');

  const threadId = await findThreadIdByContext(admin, 'listing_qa', { listingId });
  if (!threadId) {
    return NextResponse.json({ thread_id: null, messages: [] });
  }

  const messages = await loadThreadMessages(supabase, threadId);
  return NextResponse.json({
    thread_id: threadId,
    messages,
    seller_id: listing.seller_id,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId } = await params;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as { question?: string; body?: string };
  const text = (body.question ?? body.body ?? '').trim();
  if (!text || text.length > 500) {
    return NextResponse.json({ error: 'Question must be 1–500 characters' }, { status: 400 });
  }

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, brand, model, title, status')
    .eq('id', listingId)
    .maybeSingle();

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
  }
  if (listing.seller_id === user!.id) {
    return NextResponse.json({ error: 'Use the thread to reply as seller' }, { status: 400 });
  }

  const listingTitle =
    [listing.brand, listing.model].filter(Boolean).join(' ') || (listing.title as string);

  const threadId = await findOrCreateThread(admin, {
    threadType: 'listing_qa',
    tenantSlug: tenant.slug,
    participantIds: [listing.seller_id as string, user!.id],
    isPublic: true,
    listingId,
  });

  const message = await sendGuildMessage(supabase, admin, {
    threadId,
    senderId: user!.id,
    body: text,
    link: `/market/listing/${listingId}`,
    listingTitle,
  });

  const { data: asker } = await admin
    .from('users')
    .select('first_name')
    .eq('id', user!.id)
    .maybeSingle();
  const askerName = asker?.first_name?.trim() || 'Someone';

  await createNotification(admin, {
    user_id: listing.seller_id as string,
    type: 'market_listing_question',
    title: 'New question on your listing',
    body: `${askerName} asked: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`,
    data: { listingId, thread_id: threadId, link: `/market/listing/${listingId}` },
  });

  return NextResponse.json({ thread_id: threadId, message });
}
