/**
 * Query Vercel Web Analytics REST API — same aggregated data as the Vercel dashboard.
 * Requires VERCEL_ACCESS_TOKEN (or VERCEL_TOKEN) + VERCEL_PROJECT_ID; optional VERCEL_TEAM_ID.
 */

export type VercelWebAnalyticsTotals = {
  pageViews: number;
  visitors: number;
};

type AggregateRow = {
  pageviews?: number;
  visitors?: number;
};

function vercelAnalyticsCredentials(): {
  token: string;
  projectId: string;
  teamId: string | null;
} | null {
  const token = process.env.VERCEL_ACCESS_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || null;
  return { token, projectId, teamId };
}

/**
 * Totals for a calendar date range (YYYY-MM-DD, inclusive). Sums daily rows from visits/aggregate.
 */
export async function fetchVercelWebAnalyticsTotals(
  sinceYmd: string,
  untilYmd: string
): Promise<VercelWebAnalyticsTotals | null> {
  const creds = vercelAnalyticsCredentials();
  if (!creds) return null;

  const params = new URLSearchParams({
    projectId: creds.projectId,
    since: sinceYmd,
    until: untilYmd,
    by: 'day',
  });
  if (creds.teamId) params.set('teamId', creds.teamId);

  try {
    const res = await fetch(
      `https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${creds.token}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      console.warn('[fetchVercelWebAnalyticsTotals]', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as { data?: AggregateRow[] };
    const rows = json.data ?? [];
    let pageViews = 0;
    let visitors = 0;
    for (const row of rows) {
      pageViews += Number(row.pageviews ?? 0);
      visitors += Number(row.visitors ?? 0);
    }
    return { pageViews, visitors };
  } catch (e) {
    console.warn('[fetchVercelWebAnalyticsTotals]', e);
    return null;
  }
}
