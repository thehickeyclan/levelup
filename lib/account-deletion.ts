import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Data footprint used by the admin deletion-requests page to decide between a
 * permanent purge (zero footprint) and anonymization (history preserved).
 */
export type AccountFootprint = {
  coach_sessions: number;
  parent_bookings: number;
  market_listings: number;
  market_orders: number;
  message_threads: number;
  wallet_credit_rows: number;
  wallet_credit_balance: number;
};

async function resolveCount(
  label: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await query;
  if (error) {
    // Migration drift: a table may not exist in this database yet. A table
    // that does not exist cannot hold footprint, so treat as zero but log.
    console.error(`footprint count ${label}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getAccountFootprint(
  admin: SupabaseClient,
  userId: string
): Promise<AccountFootprint> {
  const head = { count: 'exact' as const, head: true };
  const [coachSessions, parentBookings, listings, ordersAsBuyer, ordersAsSeller, threads] =
    await Promise.all([
      resolveCount('sessions/coach', admin.from('sessions').select('id', head).eq('athlete_id', userId)),
      resolveCount('sessions/parent', admin.from('sessions').select('id', head).eq('parent_id', userId)),
      resolveCount('market_listings', admin.from('market_listings').select('id', head).eq('seller_id', userId)),
      resolveCount('market_orders/buyer', admin.from('market_orders').select('id', head).eq('buyer_id', userId)),
      resolveCount('market_orders/seller', admin.from('market_orders').select('id', head).eq('seller_id', userId)),
      resolveCount('guild_threads', admin.from('guild_threads').select('id', head).contains('participant_ids', [userId])),
    ]);

  let walletRows = 0;
  let walletBalance = 0;
  const { data: credits, error: creditsError } = await admin
    .from('user_credits')
    .select('remaining_amount')
    .eq('user_id', userId)
    .gt('remaining_amount', 0);
  if (creditsError) {
    console.error('footprint count user_credits:', creditsError.message);
  } else {
    walletRows = credits?.length ?? 0;
    walletBalance = (credits ?? []).reduce(
      (sum, row) => sum + Number((row as { remaining_amount: number | string }).remaining_amount || 0),
      0
    );
  }

  return {
    coach_sessions: coachSessions,
    parent_bookings: parentBookings,
    market_listings: listings,
    market_orders: ordersAsBuyer + ordersAsSeller,
    message_threads: threads,
    wallet_credit_rows: walletRows,
    wallet_credit_balance: walletBalance,
  };
}

export function isZeroFootprint(fp: AccountFootprint): boolean {
  return (
    fp.coach_sessions === 0 &&
    fp.parent_bookings === 0 &&
    fp.market_listings === 0 &&
    fp.market_orders === 0 &&
    fp.message_threads === 0 &&
    fp.wallet_credit_rows === 0 &&
    fp.wallet_credit_balance === 0
  );
}
