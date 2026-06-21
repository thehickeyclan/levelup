import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketWearState } from '@/lib/market/wear-state';

export type ListingSizeRow = {
  id: string;
  size_us: number;
  quantity: number;
};

export type ListingSizeInput = {
  size_us: number;
  quantity: number;
};

export function supportsMultiSizeInventory(wearState: MarketWearState | string | null | undefined): boolean {
  return wearState === 'bnib' || wearState === 'new_no_box';
}

export function parseListingSizeUs(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 20) return null;
  return Math.round(n * 10) / 10;
}

export function formatListingSizesLabel(sizes: ListingSizeRow[]): string | null {
  const available = sizes.filter((s) => s.quantity > 0);
  if (!available.length) return null;
  const nums = available.map((s) => s.size_us).sort((a, b) => a - b);
  if (nums.length === 1) return `Size ${nums[0]}`;
  if (nums.length <= 4) return `Sizes ${nums.join(', ')}`;
  return `${nums.length} sizes`;
}

export function listingHasMultiSizeInventory(sizes: ListingSizeRow[]): boolean {
  return sizes.filter((s) => s.quantity > 0).length > 1;
}

function isMissingSizesTableError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('market_listing_sizes') && (m.includes('does not exist') || m.includes('schema cache'));
}

export async function fetchListingSizes(
  supabase: SupabaseClient,
  listingId: string
): Promise<ListingSizeRow[]> {
  const { data, error } = await supabase
    .from('market_listing_sizes')
    .select('id, size_us, quantity')
    .eq('listing_id', listingId)
    .order('size_us', { ascending: true });

  if (error) {
    if (isMissingSizesTableError(error.message)) return [];
    console.error('fetchListingSizes:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    size_us: Number(row.size_us),
    quantity: Number(row.quantity),
  }));
}

export function normalizeSizeInputs(
  inputs: ListingSizeInput[]
): ListingSizeInput[] {
  const bySize = new Map<number, number>();
  for (const row of inputs) {
    const size = parseListingSizeUs(row.size_us);
    if (!size) continue;
    const qty = Math.max(0, Math.min(99, Math.round(Number(row.quantity) || 0)));
    if (qty <= 0) continue;
    bySize.set(size, (bySize.get(size) ?? 0) + qty);
  }
  return Array.from(bySize.entries())
    .map(([size_us, quantity]) => ({ size_us, quantity }))
    .sort((a, b) => a.size_us - b.size_us);
}

export async function replaceListingSizes(
  supabase: SupabaseClient,
  listingId: string,
  inputs: ListingSizeInput[]
): Promise<{ sizes: ListingSizeRow[]; error?: string }> {
  const normalized = normalizeSizeInputs(inputs);
  const { error: delErr } = await supabase
    .from('market_listing_sizes')
    .delete()
    .eq('listing_id', listingId);
  if (delErr) {
    if (isMissingSizesTableError(delErr.message)) {
      return { sizes: [], error: 'Size inventory is not available yet — run the market listing sizes migration.' };
    }
    return { sizes: [], error: delErr.message };
  }

  if (!normalized.length) {
    return { sizes: [] };
  }

  const { data, error } = await supabase
    .from('market_listing_sizes')
    .insert(
      normalized.map((row) => ({
        listing_id: listingId,
        size_us: row.size_us,
        quantity: row.quantity,
      }))
    )
    .select('id, size_us, quantity');

  if (error) {
    return { sizes: [], error: error.message };
  }

  return {
    sizes: (data ?? []).map((row) => ({
      id: row.id as string,
      size_us: Number(row.size_us),
      quantity: Number(row.quantity),
    })),
  };
}

export async function syncListingPrimarySize(
  supabase: SupabaseClient,
  listingId: string,
  sizes: ListingSizeRow[]
): Promise<void> {
  const available = sizes.filter((s) => s.quantity > 0).map((s) => s.size_us);
  if (!available.length) return;
  const minSize = Math.min(...available);
  await supabase.from('market_listings').update({ size: minSize }).eq('id', listingId);
}

export async function reserveListingSize(
  supabase: SupabaseClient,
  listingId: string,
  sizeUs: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('market_listing_sizes')
    .select('id, quantity')
    .eq('listing_id', listingId)
    .eq('size_us', sizeUs)
    .maybeSingle();

  if (error) {
    if (isMissingSizesTableError(error.message)) {
      return { ok: false, error: 'Size inventory is not available.' };
    }
    return { ok: false, error: error.message };
  }
  if (!data || Number(data.quantity) <= 0) {
    return { ok: false, error: 'That size is no longer available.' };
  }

  const { data: updated, error: updErr } = await supabase
    .from('market_listing_sizes')
    .update({ quantity: Number(data.quantity) - 1 })
    .eq('id', data.id)
    .gt('quantity', 0)
    .select('id')
    .maybeSingle();

  if (updErr || !updated) {
    return { ok: false, error: 'That size is no longer available.' };
  }
  return { ok: true };
}

export async function restoreListingSize(
  supabase: SupabaseClient,
  listingId: string,
  sizeUs: number
): Promise<void> {
  const { data } = await supabase
    .from('market_listing_sizes')
    .select('id, quantity')
    .eq('listing_id', listingId)
    .eq('size_us', sizeUs)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('market_listing_sizes')
    .update({ quantity: Number(data.quantity) + 1 })
    .eq('id', data.id);
}

export async function listingInventoryDepleted(
  supabase: SupabaseClient,
  listingId: string
): Promise<boolean> {
  const sizes = await fetchListingSizes(supabase, listingId);
  if (!sizes.length) return false;
  return sizes.every((s) => s.quantity <= 0);
}
