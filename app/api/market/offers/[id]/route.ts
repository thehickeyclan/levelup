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
  const { tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'decline' | 'accept' | 'withdraw';
  };
  if (body.action !== 'decline' && body.action !== 'accept' && body.action !== 'withdraw') {
    return NextResponse.json({ error: 'action must be decline, accept, or withdraw' }, { status: 400 });
  }

  const { data: offer, error: offerErr } = await admin
    .from('market_offers')
    .select(
      'id, buyer_id, listing_id, status, offer_type, amount_cents, expires_at, market_listings!listing_id(seller_id, title, brand, model)'
    )
    .eq('id', id)
    .maybeSingle();

  if (offerErr) {
    console.error('offer patch lookup:', offerErr);
    return NextResponse.json({ error: 'Could not load offer' }, { status: 500 });
  }
  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });

  const listingRaw = offer.market_listings;
  const listing = (Array.isArray(listingRaw) ? listingRaw[0] : listingRaw) as {
    seller_id: string;
    title: string;
    brand: string;
    model: string;
  } | null;

  if (!listing) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
  }
  // Withdraw belongs to the buyer; accept/decline to the seller.
  if (body.action === 'withdraw') {
    if (offer.buyer_id !== user!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Offer already handled' }, { status: 400 });
  }

  const listingLabel = [listing.brand, listing.model].filter(Boolean).join(' ') || listing.title;

  // Offers expire 48h after they are made; an expired offer can only lapse.
  if (
    body.action !== 'withdraw' &&
    offer.expires_at &&
    new Date(offer.expires_at as string).getTime() < Date.now()
  ) {
    await admin.from('market_offers').update({ status: 'expired' }).eq('id', id).eq('status', 'pending');
    return NextResponse.json(
      { error: 'This offer expired — ask the buyer to send a new one.' },
      { status: 400 }
    );
  }

  const newStatus =
    body.action === 'accept' ? 'accepted' : body.action === 'withdraw' ? 'withdrawn' : 'declined';

  const { error } = await admin
    .from('market_offers')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.action === 'withdraw') {
    await createNotification(admin, {
      user_id: listing.seller_id,
      type: 'market_offer_withdrawn',
      title: 'Offer withdrawn',
      body: `The $${((offer.amount_cents as number) / 100).toFixed(0)} offer on ${listingLabel} was withdrawn by the buyer.`,
      data: { offer_id: id, listing_id: offer.listing_id },
    }).catch((e) => console.warn('offer withdraw notification:', e));
    return NextResponse.json({ ok: true, status: 'withdrawn' });
  }

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
