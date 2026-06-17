import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { createNotification } from '@/lib/notifications';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { action?: 'decline' | 'accept' };
  if (body.action !== 'decline' && body.action !== 'accept') {
    return NextResponse.json({ error: 'action must be decline or accept' }, { status: 400 });
  }

  const { data: offer } = await supabase
    .from('market_offers')
    .select('id, buyer_id, listing_id, status, offer_type, amount_cents, market_listings(seller_id, title, brand, model)')
    .eq('id', id)
    .maybeSingle();

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });

  const listingRaw = offer.market_listings;
  const listing = (Array.isArray(listingRaw) ? listingRaw[0] : listingRaw) as {
    seller_id: string;
    title: string;
    brand: string;
    model: string;
  } | null;

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Offer already handled' }, { status: 400 });
  }

  const listingLabel = [listing.brand, listing.model].filter(Boolean).join(' ') || listing.title;
  const newStatus = body.action === 'accept' ? 'accepted' : 'declined';

  const { error } = await admin
    .from('market_offers')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createNotification(admin, {
    user_id: offer.buyer_id as string,
    type: 'market_offer_response',
    title: body.action === 'accept' ? 'Offer accepted' : 'Offer declined',
    body:
      body.action === 'accept'
        ? `Seller accepted your offer on ${listingLabel}. They may reach out to complete the deal.`
        : `Your offer on ${listingLabel} was declined.`,
    data: {
      listing_id: offer.listing_id,
      offer_id: id,
      link: `/market/listing/${offer.listing_id}`,
    },
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
