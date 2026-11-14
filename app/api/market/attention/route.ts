import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

/**
 * Market attention — the one number (and short list) behind the Market tab
 * badge, the Market-screen activity strip, and the My Market Offers count.
 * "Needs you" means: a pending, unexpired offer on a listing you're selling,
 * or an offer you sent that was accepted and is waiting on your payment.
 */

type ListingEmbed = {
  id?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
} | null;

function listingTitle(listing: ListingEmbed) {
  if (!listing) return 'your listing';
  return (
    [listing.brand, listing.model].filter(Boolean).join(' ') ||
    listing.title ||
    'your listing'
  );
}

function embedded(row: unknown): ListingEmbed {
  const value = (row as { market_listings?: ListingEmbed | ListingEmbed[] }).market_listings;
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET() {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient(tenant.slug);
  const nowIso = new Date().toISOString();

  const [{ data: incomingRows, error: incomingError }, { data: payRows, error: payError }] =
    await Promise.all([
      admin
        .from('market_offers')
        .select(
          'id, amount_cents, offer_type, created_at, market_listings!listing_id!inner(id, title, brand, model, seller_id)'
        )
        .eq('status', 'pending')
        .eq('market_listings.seller_id', user.id)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('market_offers')
        .select(
          'id, amount_cents, accepted_order_id, created_at, market_listings!listing_id(id, title, brand, model), market_orders!accepted_order_id!inner(id, status)'
        )
        .eq('buyer_id', user.id)
        .eq('status', 'accepted')
        .eq('market_orders.status', 'pending_payment')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

  if (incomingError || payError) {
    console.error('market attention error:', incomingError ?? payError);
    return NextResponse.json({ error: (incomingError ?? payError)!.message }, { status: 500 });
  }

  const incoming = incomingRows ?? [];
  const pay = payRows ?? [];

  const items = [
    ...pay.map((row) => ({
      kind: 'pay' as const,
      offer_id: row.id as string,
      listing_id: embedded(row)?.id ?? null,
      listing_title: listingTitle(embedded(row)),
      amount_cents: (row.amount_cents as number | null) ?? null,
    })),
    ...incoming.map((row) => ({
      kind: 'incoming' as const,
      offer_id: row.id as string,
      listing_id: embedded(row)?.id ?? null,
      listing_title: listingTitle(embedded(row)),
      amount_cents: (row.amount_cents as number | null) ?? null,
    })),
  ].slice(0, 3);

  return NextResponse.json({
    incoming: incoming.length,
    awaiting_payment: pay.length,
    total: incoming.length + pay.length,
    items,
  });
}
