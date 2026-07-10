/**
 * Query Vercel Web Analytics REST API — same aggregated data as the Vercel dashboard.
 */
import {
  WRESTLING_GUILD_VERCEL_PROJECT_ID,
  WRESTLING_GUILD_VERCEL_TEAM_ID,
  WRESTLING_GUILD_VERCEL_TEAM_SLUG,
} from '@/lib/vercel-analytics-config';

export type VercelWebAnalyticsTotals = {
  pageViews: number;
  visitors: number;
};

export type VercelWebAnalyticsFetchResult =
  | ({ ok: true } & VercelWebAnalyticsTotals)
  | { ok: false; reason: string };

type AggregateRow = {
  pageviews?: number;
  visitors?: number;
};

type TeamScope = {
  teamId?: string;
  slug?: string;
};

function vercelAnalyticsToken(): string | null {
  return process.env.VERCEL_ACCESS_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim() || null;
}

export function vercelAnalyticsTokenConfigured(): boolean {
  return !!vercelAnalyticsToken();
}

function vercelAnalyticsProjectId(): string | null {
  return (
    process.env.VERCEL_PROJECT_ID?.trim() ||
    process.env.VERCEL_ANALYTICS_PROJECT_ID?.trim() ||
    WRESTLING_GUILD_VERCEL_PROJECT_ID
  );
}

function vercelAnalyticsTeamScopes(): TeamScope[] {
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || WRESTLING_GUILD_VERCEL_TEAM_ID;
  const slug = process.env.VERCEL_TEAM_SLUG?.trim() || WRESTLING_GUILD_VERCEL_TEAM_SLUG;
  const scopes: TeamScope[] = [];
  if (teamId) scopes.push({ teamId });
  if (slug) scopes.push({ slug });
  scopes.push({});
  return scopes;
}

function credentialError(): string | null {
  if (!vercelAnalyticsToken()) {
    return 'Missing VERCEL_ACCESS_TOKEN';
  }
  if (!vercelAnalyticsProjectId()) {
    return 'Missing VERCEL_PROJECT_ID';
  }
  return null;
}

function appendTeamScope(params: URLSearchParams, scope: TeamScope) {
  if (scope.teamId) params.set('teamId', scope.teamId);
  else if (scope.slug) params.set('slug', scope.slug);
}

function totalsFromCountPayload(data: unknown): VercelWebAnalyticsTotals | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const pageViews = Number(row.pageviews ?? row.pageViews);
  const visitors = Number(row.visitors);
  if (!Number.isFinite(pageViews) || !Number.isFinite(visitors)) return null;
  return { pageViews, visitors };
}

function totalsFromAggregateRows(data: unknown): VercelWebAnalyticsTotals | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  let pageViews = 0;
  let visitors = 0;
  for (const row of data as AggregateRow[]) {
    pageViews += Number(row.pageviews ?? 0);
    visitors += Number(row.visitors ?? 0);
  }
  return { pageViews, visitors };
}

async function queryVercelAnalytics(
  path: 'visits/count' | 'visits/aggregate',
  sinceYmd: string,
  untilYmd: string,
  token: string,
  projectId: string,
  scope: TeamScope
): Promise<{ ok: true; totals: VercelWebAnalyticsTotals } | { ok: false; status: number; body: string }> {
  const params = new URLSearchParams({
    projectId,
    since: sinceYmd,
    until: untilYmd,
  });
  if (path === 'visits/aggregate') params.set('by', 'day');
  appendTeamScope(params, scope);

  const res = await fetch(`https://api.vercel.com/v1/query/web-analytics/${path}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    return { ok: false, status: res.status, body };
  }

  let json: { data?: unknown };
  try {
    json = JSON.parse(body) as { data?: unknown };
  } catch {
    return { ok: false, status: res.status, body: body || 'Invalid JSON' };
  }

  const totals =
    path === 'visits/count'
      ? totalsFromCountPayload(json.data)
      : totalsFromAggregateRows(json.data);
  if (!totals) {
    return { ok: false, status: res.status, body: body || 'Unexpected analytics response shape' };
  }
  return { ok: true, totals };
}

function formatApiFailure(status: number, body: string, scope: TeamScope): string {
  const needsTeam = status === 403 || /team/i.test(body);
  if (needsTeam && !scope.teamId && !scope.slug) {
    return 'Vercel API 403 — add VERCEL_TEAM_ID (Team Settings → General) for this team project';
  }
  if (status === 401 || status === 403) {
    return `Vercel API ${status} — check token scope includes this team/project`;
  }
  const snippet = body.slice(0, 120).replace(/\s+/g, ' ').trim();
  return snippet ? `Vercel API ${status}: ${snippet}` : `Vercel API ${status}`;
}

/**
 * Totals for a calendar date range (YYYY-MM-DD, inclusive).
 */
export async function fetchVercelWebAnalyticsTotals(
  sinceYmd: string,
  untilYmd: string
): Promise<VercelWebAnalyticsFetchResult> {
  const configError = credentialError();
  if (configError) return { ok: false, reason: configError };

  const token = vercelAnalyticsToken()!;
  const projectId = vercelAnalyticsProjectId()!;
  const scopes = vercelAnalyticsTeamScopes();
  let lastError = 'Vercel Analytics API unavailable';

  for (const scope of scopes) {
    for (const path of ['visits/count', 'visits/aggregate'] as const) {
      try {
        const result = await queryVercelAnalytics(path, sinceYmd, untilYmd, token, projectId, scope);
        if (result.ok) {
          return { ok: true, pageViews: result.totals.pageViews, visitors: result.totals.visitors };
        }
        lastError = formatApiFailure(result.status, result.body, scope);
        if (result.status === 401 || result.status === 403) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Vercel Analytics API request failed';
      }
    }
    if (lastError.includes('403') || lastError.includes('401')) continue;
    break;
  }

  return { ok: false, reason: lastError };
}
