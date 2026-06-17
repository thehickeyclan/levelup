import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    amount_cents?: number;
    message?: string;
    offer_type?: 'cash' | 'trade';
  };

  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, status, listing_type, price_cents')
    .eq('id', listingId)
    .single();

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
  }
  if (listing.seller_id === user!.id) {
    return NextResponse.json({ error: 'You cannot offer on your own listing' }, { status: 400 });
  }

  const offerType = body.offer_type === 'trade' ? 'trade' : 'cash';
  const amountCents = body.amount_cents != null ? Math.round(body.amount_cents) : null;
  if (offerType === 'cash' && (!amountCents || amountCents < 100)) {
    return NextResponse.json({ error: 'Enter a valid offer amount' }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('market_offers')
    .insert({
      tenant_slug: tenant.slug,
      listing_id: listingId,
      buyer_id: user!.id,
      offer_type: offerType,
      amount_cents: offerType === 'cash' ? amountCents : null,
      message: body.message?.trim().slice(0, 500) || null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { createNotification } = await import('@/lib/notifications');
  await createNotification(admin, {
    user_id: listing.seller_id,
    type: 'market_vault_offer',
    title: offerType === 'trade' ? 'New trade offer' : 'New offer on your vault pair',
    body: offerType === 'cash' && amountCents
      ? `Offer: $${(amountCents / 100).toFixed(0)} — review in My listings.`
      : 'A buyer sent an offer — review in My listings.',
    data: { listing_id: listingId, offer_id: data.id },
  });

  return NextResponse.json({ offerId: data.id });
}
