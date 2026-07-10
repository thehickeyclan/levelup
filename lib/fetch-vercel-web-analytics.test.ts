import { describe, expect, it } from 'vitest';
import { fetchVercelWebAnalyticsTotals, vercelAnalyticsTokenConfigured } from './fetch-vercel-web-analytics';

describe('fetchVercelWebAnalyticsTotals', () => {
  it('returns missing token reason when credentials absent', async () => {
    const prevToken = process.env.VERCEL_ACCESS_TOKEN;
    const prevProject = process.env.VERCEL_PROJECT_ID;
    delete process.env.VERCEL_ACCESS_TOKEN;
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;

    const result = await fetchVercelWebAnalyticsTotals('2026-01-01', '2026-01-31');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('VERCEL_ACCESS_TOKEN');
    }

    if (prevToken) process.env.VERCEL_ACCESS_TOKEN = prevToken;
    if (prevProject) process.env.VERCEL_PROJECT_ID = prevProject;
  });

  it('detects configured analytics token', () => {
    const prevToken = process.env.VERCEL_ACCESS_TOKEN;
    process.env.VERCEL_ACCESS_TOKEN = 'test-token';
    expect(vercelAnalyticsTokenConfigured()).toBe(true);
    if (prevToken) process.env.VERCEL_ACCESS_TOKEN = prevToken;
    else delete process.env.VERCEL_ACCESS_TOKEN;
  });
});
