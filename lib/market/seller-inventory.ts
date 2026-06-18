import type { SupabaseClient } from '@supabase/supabase-js';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

export type SellerInventoryItem = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  listing_type: string;
  primary_image_url: string | null;
};

type Row = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  listing_type: string;
  market_listing_images: { public_url: string; display_order: number }[] | null;
};

function mapRow(row: Row): SellerInventoryItem {
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    size: Number(row.size),
    listing_type: row.listing_type,
    primary_image_url: primaryListingImageUrl(row.market_listing_images),
  };
}

export async function fetchSellerActiveInventory(
  supabase: SupabaseClient,
  sellerId: string
): Promise<{ forSale: SellerInventoryItem[]; trading: SellerInventoryItem[]; collection: SellerInventoryItem[] }> {
  const { data } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, listing_type,
      market_listing_images(public_url, clean_public_url, use_clean, display_order)
    `)
    .eq('seller_id', sellerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Row[];
  const forSale: SellerInventoryItem[] = [];
  const trading: SellerInventoryItem[] = [];
  const collection: SellerInventoryItem[] = [];

  for (const row of rows) {
    const item = mapRow(row);
    if (row.listing_type === 'collection') {
      collection.push(item);
    } else if (row.listing_type === 'trade') {
      trading.push(item);
    } else if (row.listing_type === 'sell' || row.listing_type === 'vault') {
      forSale.push(item);
    }
  }

  return { forSale, trading, collection };
}
