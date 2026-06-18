import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriceComp } from '@/lib/market/ai/schemas';
import type { SaleComp } from '@/lib/market/shoe-id/schemas';
import { wearStateLabel } from '@/lib/market/wear-state';
import type { MarketWearState } from '@/lib/market/wear-state';

type GuildOrderRow = {
  amount_cents: number;
  created_at: string;
  market_listings: {
    size: number | null;
    condition: string | null;
    wear_state: string | null;
    colorway: string | null;
  } | { size: number | null; condition: string | null; wear_state: string | null; colorway: string | null }[] | null;
};

function listingFromOrder(row: GuildOrderRow) {
  const raw = row.market_listings;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function sizeDistance(sellerSize: number | null | undefined, compSize: number | null | undefined): number {
  if (sellerSize == null || Number.isNaN(sellerSize)) return 0;
  if (compSize == null || Number.isNaN(compSize)) return 2;
  return Math.abs(sellerSize - compSize);
}

function formatGuildCompLabel(
  listing: NonNullable<ReturnType<typeof listingFromOrder>>
): string {
  const bits: string[] = [];
  if (listing.size != null) bits.push(`size ${listing.size}`);
  if (listing.colorway?.trim()) bits.push(listing.colorway.trim());
  if (listing.condition) bits.push(listing.condition.replace('_', ' '));
  if (listing.wear_state) {
    bits.push(wearStateLabel(listing.wear_state as MarketWearState));
  }
  return bits.length ? bits.join(' · ') : 'Guild sale';
}

export function catalogSaleCompsToPriceComps(comps: SaleComp[]): PriceComp[] {
  return comps.map((c) => {
    const bits: string[] = [];
    if (c.colorway?.trim()) bits.push(c.colorway.trim());
    if (c.size_us != null) bits.push(`size ${c.size_us}`);
    if (c.condition?.trim()) bits.push(c.condition.trim());
    if (c.source?.trim()) bits.push(c.source.trim());

    return {
      source: 'catalog' as const,
      price_cents: c.sold_price_cents,
      label: bits.length ? bits.join(' · ') : 'Documented sale',
      size_us: c.size_us,
      colorway: c.colorway,
      condition: c.condition,
      notes: c.notes,
    };
  });
}

export async function fetchGuildPlatformComps(
  admin: SupabaseClient,
  brand: string,
  model: string,
  sellerSize?: number | null,
  limit = 10
): Promise<PriceComp[]> {
  if (!brand?.trim() || !model?.trim()) return [];

  const { data: similarListings } = await admin
    .from('market_listings')
    .select('id')
    .eq('brand', brand)
    .ilike('model', `%${model}%`);

  const similarIds = (similarListings ?? []).map((l) => l.id);
  if (!similarIds.length) return [];

  const { data: orders } = await admin
    .from('market_orders')
    .select(
      'amount_cents, created_at, market_listings(size, condition, wear_state, colorway)'
    )
    .in('listing_id', similarIds)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(30);

  const rows = (orders ?? []) as GuildOrderRow[];
  const sorted = [...rows].sort((a, b) => {
    const aListing = listingFromOrder(a);
    const bListing = listingFromOrder(b);
    const sizeDiff =
      sizeDistance(sellerSize, aListing?.size ?? null) -
      sizeDistance(sellerSize, bListing?.size ?? null);
    if (sizeDiff !== 0) return sizeDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return sorted.slice(0, limit).map((row) => {
    const listing = listingFromOrder(row);
    return {
      source: 'guild' as const,
      price_cents: row.amount_cents,
      label: listing ? formatGuildCompLabel(listing) : 'Guild sale',
      date: row.created_at,
      size_us: listing?.size ?? undefined,
      colorway: listing?.colorway ?? undefined,
      condition: listing?.condition ?? undefined,
      wear_state: listing?.wear_state ?? undefined,
    };
  });
}

export function formatGuildCompSummary(comps: PriceComp[]): string {
  if (!comps.length) return 'none';
  return comps
    .map((c) => {
      const price = `$${Math.round(c.price_cents / 100)}`;
      const detail = c.label === 'Guild sale' ? price : `${price} (${c.label})`;
      return detail;
    })
    .join(', ');
}
