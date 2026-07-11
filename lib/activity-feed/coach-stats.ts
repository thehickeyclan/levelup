import type { SupabaseClient } from '@supabase/supabase-js';

function startOfWeekIso(now = new Date()): string {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Kudos on posts tied to this coach's sessions since Monday (local week). */
export async function fetchCoachActivityKudosThisWeek(
  db: SupabaseClient,
  coachId: string
): Promise<number> {
  const weekStart = startOfWeekIso();

  const { data: posts, error: postsErr } = await db
    .from('activity_posts')
    .select('id')
    .eq('coach_id', coachId)
    .gte('created_at', weekStart);

  if (postsErr || !posts?.length) {
    if (postsErr) console.error('coach activity posts:', postsErr);
    return 0;
  }

  const postIds = posts.map((p: { id: string }) => p.id);
  const { count, error: kudosErr } = await db
    .from('activity_kudos')
    .select('id', { count: 'exact', head: true })
    .in('post_id', postIds)
    .gte('created_at', weekStart);

  if (kudosErr) {
    console.error('coach activity kudos:', kudosErr);
    return 0;
  }

  return count ?? 0;
}
