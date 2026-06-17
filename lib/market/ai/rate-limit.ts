import type { SupabaseClient } from '@supabase/supabase-js';

const HOURLY_LIMIT = 10;

export async function checkAndIncrementAiUsage(
  admin: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; remaining: number; count: number }> {
  const { data, error } = await admin.rpc('increment_market_ai_usage', { p_user_id: userId });
  if (error) {
    console.error('increment_market_ai_usage:', error);
    return { allowed: true, remaining: HOURLY_LIMIT, count: 0 };
  }
  const count = typeof data === 'number' ? data : Number(data) || 1;
  return {
    allowed: count <= HOURLY_LIMIT,
    remaining: Math.max(0, HOURLY_LIMIT - count),
    count,
  };
}
