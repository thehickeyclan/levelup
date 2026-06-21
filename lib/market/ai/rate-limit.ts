import type { SupabaseClient } from '@supabase/supabase-js';

/** Full listing auto-fill (shoe ID + condition + price + rarity + description) uses ~5 calls. */
const DEFAULT_HOURLY_LIMIT = 48;

export function marketAiHourlyLimit(): number {
  const raw = process.env.MARKET_AI_HOURLY_LIMIT?.trim();
  if (!raw) return DEFAULT_HOURLY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_HOURLY_LIMIT;
}

export function isAiRateLimitBypass(role: string | undefined): boolean {
  return role === 'admin';
}

export async function checkAndIncrementAiUsage(
  admin: SupabaseClient,
  userId: string,
  options?: { bypass?: boolean }
): Promise<{ allowed: boolean; remaining: number; count: number; limit: number }> {
  const limit = marketAiHourlyLimit();

  if (options?.bypass) {
    return { allowed: true, remaining: limit, count: 0, limit };
  }

  const { data, error } = await admin.rpc('increment_market_ai_usage', { p_user_id: userId });
  if (error) {
    console.error('increment_market_ai_usage:', error);
    return { allowed: true, remaining: limit, count: 0, limit };
  }
  const count = typeof data === 'number' ? data : Number(data) || 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    count,
    limit,
  };
}

export function aiLimitReachedMessage(count: number, limit: number): string {
  return `AI limit reached (${count}/${limit} calls this hour). Listing setup uses several AI steps — wait until the top of the next hour or try again with fewer retries.`;
}
