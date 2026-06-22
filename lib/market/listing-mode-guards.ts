import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_TRADE_STATUSES } from '@/lib/market/trade-lifecycle';

export type ListingModeConstraints = {
  locked_buyer_id: string | null;
  in_active_trade: boolean;
  active_trade_id: string | null;
  pending_offer_count: number;
  can_change_mode: boolean;
  blocked_reason: string | null;
};

export async function getListingModeConstraints(
  admin: SupabaseClient,
  listingId: string
): Promise<ListingModeConstraints> {
  const { data: listing } = await admin
    .from('market_listings')
    .select('locked_buyer_id')
    .eq('id', listingId)
    .maybeSingle();

  const lockedBuyerId = (listing?.locked_buyer_id as string | null) ?? null;

  const { data: activeTrade } = await admin
    .from('market_trades')
    .select('id')
    .in('status', [...ACTIVE_TRADE_STATUSES])
    .or(`initiator_listing_id.eq.${listingId},receiver_listing_id.eq.${listingId}`)
    .maybeSingle();

  const inActiveTrade = Boolean(activeTrade);
  const activeTradeId = (activeTrade?.id as string) ?? null;

  const { count: pendingOffers } = await admin
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('status', 'pending');

  const pendingOfferCount = pendingOffers ?? 0;

  let blockedReason: string | null = null;
  if (inActiveTrade) {
    blockedReason =
      'This pair is in an active trade. Cancel the trade or wait for it to finish before changing how it’s listed.';
  } else if (lockedBuyerId) {
    blockedReason = 'This pair is reserved for a checkout or trade. Wait until that completes.';
  } else if (pendingOfferCount > 0) {
    blockedReason = `Resolve ${pendingOfferCount} pending offer${pendingOfferCount !== 1 ? 's' : ''} before moving back to collection.`;
  }

  return {
    locked_buyer_id: lockedBuyerId,
    in_active_trade: inActiveTrade,
    active_trade_id: activeTradeId,
    pending_offer_count: pendingOfferCount,
    can_change_mode: !blockedReason,
    blocked_reason: blockedReason,
  };
}

export function isListingModeChange(
  updates: Record<string, unknown>,
  prevType: string
): boolean {
  if (updates.listing_type != null && updates.listing_type !== prevType) return true;
  if (updates.price_cents !== undefined && prevType === 'sell') return true;
  if (updates.open_to_trade !== undefined) return true;
  return false;
}

/** Batch-friendly constraints without extra DB round-trips. */
export function deriveListingModeConstraints(params: {
  locked_buyer_id: string | null;
  active_trade_id: string | null;
  pending_offer_count: number;
}): Pick<
  ListingModeConstraints,
  'can_change_mode' | 'blocked_reason' | 'active_trade_id'
> {
  const { locked_buyer_id, active_trade_id, pending_offer_count } = params;

  let blockedReason: string | null = null;
  if (active_trade_id) {
    blockedReason =
      'This pair is in an active trade. Cancel the trade or wait for it to finish before changing how it’s listed.';
  } else if (locked_buyer_id) {
    blockedReason = 'This pair is reserved for a checkout or trade. Wait until that completes.';
  } else if (pending_offer_count > 0) {
    blockedReason = `Resolve ${pending_offer_count} pending offer${pending_offer_count !== 1 ? 's' : ''} before moving back to collection.`;
  }

  return {
    can_change_mode: !blockedReason,
    blocked_reason: blockedReason,
    active_trade_id,
  };
}
