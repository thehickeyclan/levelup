import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

export type SellerOfferTradeListing = {
  id: string;
  model: string;
  title: string;
  size: number;
  primary_image_url: string | null;
};

export type SellerOfferRow = {
  id: string;
  listing_id: string;
  offer_type: string;
  amount_cents: number | null;
  message: string | null;
  status: string;
  created_at: string;
  buyer_id: string;
  buyer_label: string;
  listing_title: string;
  listing_brand: string;
  listing_model: string;
  listing_image_url: string | null;
  trade_listing: SellerOfferTradeListing | null;
};

export type SellerOfferGroup = {
  listing_id: string;
  listing_title: string;
  listing_image_url: string | null;
  offers: SellerOfferRow[];
};

export async function fetchSellerOffers(
  supabase: SupabaseClient,
  sellerId: string,
  filterListingId?: string
): Promise<SellerOfferGroup[]> {
  const { data: myListings } = await supabase.from('market_listings').select('id').eq('seller_id', sellerId);
  const listingIds = (myListings ?? []).map((l) => l.id as string);
  if (!listingIds.length) return [];

  let offerQuery = supabase
    .from('market_offers')
    .select(`
      id, listing_id, offer_type, amount_cents, message, status, created_at, buyer_id, trade_listing_id,
      market_listings(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))
    `)
    .in('listing_id', filterListingId ? [filterListingId] : listingIds)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: offers } = await offerQuery;
  if (!offers?.length) return [];

  const buyerIds = [...new Set(offers.map((o) => o.buyer_id as string))];
  const tradeListingIds = [
    ...new Set(offers.map((o) => o.trade_listing_id as string | null).filter(Boolean)),
  ] as string[];

  const [{ data: buyers }, { data: tradeListings }] = await Promise.all([
    supabase.from('users').select('id, first_name, last_name').in('id', buyerIds),
    tradeListingIds.length
      ? supabase
          .from('market_listings')
          .select('id, title, model, size, market_listing_images(public_url, clean_public_url, use_clean, display_order)')
          .in('id', tradeListingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const buyerNames = new Map<string, string>();
  for (const b of buyers ?? []) {
    buyerNames.set(b.id as string, formatSellerDisplayName(b.first_name as string, b.last_name as string));
  }

  const tradeMap = new Map<string, SellerOfferTradeListing>();
  for (const t of tradeListings ?? []) {
    tradeMap.set(t.id as string, {
      id: t.id as string,
      model: t.model as string,
      title: t.title as string,
      size: Number(t.size),
      primary_image_url: primaryListingImageUrl(
        t.market_listing_images as { public_url: string; display_order: number }[] | null
      ),
    });
  }

  const rows: SellerOfferRow[] = offers.map((o) => {
    const listingRaw = o.market_listings;
    const listing = (Array.isArray(listingRaw) ? listingRaw[0] : listingRaw) as {
      title: string;
      brand: string;
      model: string;
      market_listing_images?: { public_url: string; display_order: number }[];
    } | null;
    const tradeId = o.trade_listing_id as string | null;
    return {
      id: o.id as string,
      listing_id: o.listing_id as string,
      offer_type: o.offer_type as string,
      amount_cents: o.amount_cents as number | null,
      message: o.message as string | null,
      status: o.status as string,
      created_at: o.created_at as string,
      buyer_id: o.buyer_id as string,
      buyer_label: buyerNames.get(o.buyer_id as string) ?? 'Buyer',
      listing_title: listing?.title ?? 'Listing',
      listing_brand: listing?.brand ?? '',
      listing_model: listing?.model ?? '',
      listing_image_url: primaryListingImageUrl(listing?.market_listing_images ?? null),
      trade_listing: tradeId ? tradeMap.get(tradeId) ?? null : null,
    };
  });

  const groups = new Map<string, SellerOfferGroup>();
  for (const row of rows) {
    const key = row.listing_id;
    const existing = groups.get(key);
    const title = [row.listing_brand, row.listing_model].filter(Boolean).join(' ') || row.listing_title;
    if (existing) {
      existing.offers.push(row);
    } else {
      groups.set(key, {
        listing_id: key,
        listing_title: title,
        listing_image_url: row.listing_image_url,
        offers: [row],
      });
    }
  }

  return [...groups.values()];
}
