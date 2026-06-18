import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient(auth.tenantSlug);

  const [
    { count: totalCatalog },
    { count: verifiedCatalog },
    { count: totalIds },
    { count: confirmedIds },
    { count: catalogMatches },
    { data: results },
    { data: catalog },
  ] = await Promise.all([
    admin.from('wrestling_shoes_catalog').select('id', { count: 'exact', head: true }),
    admin
      .from('wrestling_shoes_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('verified', true),
    admin.from('shoe_id_results').select('id', { count: 'exact', head: true }),
    admin
      .from('shoe_id_results')
      .select('id', { count: 'exact', head: true })
      .eq('confirmed', true),
    admin
      .from('shoe_id_results')
      .select('id', { count: 'exact', head: true })
      .not('catalog_match_id', 'is', null),
    admin
      .from('shoe_id_results')
      .select('identified_brand, identified_model, catalog_match_id, confirmed, confidence, raw_response')
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('wrestling_shoes_catalog').select('*').order('brand'),
  ]);

  const total = totalIds ?? 0;
  const confirmed = confirmedIds ?? 0;
  const matches = catalogMatches ?? 0;

  const missCounts = new Map<string, number>();
  for (const r of results ?? []) {
    const raw = r.raw_response as { catalog_matched?: boolean } | null;
    const missed = !r.catalog_match_id && raw?.catalog_matched === false;
    if (missed || (r.confirmed === false && !r.catalog_match_id)) {
      const key = `${r.identified_brand} / ${r.identified_model}`;
      missCounts.set(key, (missCounts.get(key) ?? 0) + 1);
    }
  }

  const mostMissed = [...missCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  const buckets = [
    { label: '90–100%', min: 0.9, max: 1.01, count: 0 },
    { label: '70–89%', min: 0.7, max: 0.9, count: 0 },
    { label: '50–69%', min: 0.5, max: 0.7, count: 0 },
    { label: 'Below 50%', min: 0, max: 0.5, count: 0 },
  ];

  for (const r of results ?? []) {
    const c = Number(r.confidence) || 0;
    const bucket = buckets.find((b) => c >= b.min && c < b.max);
    if (bucket) bucket.count += 1;
  }

  const firstTryCorrect = (results ?? []).filter((r) => {
    const raw = r.raw_response as { catalog_matched?: boolean } | null;
    return r.confirmed && (r.catalog_match_id || raw?.catalog_matched);
  }).length;

  return NextResponse.json({
    totalCatalog: totalCatalog ?? 0,
    verifiedCatalog: verifiedCatalog ?? 0,
    totalIdentifications: total,
    confirmedIdentifications: confirmed,
    correctFirstTry: firstTryCorrect,
    correctFirstTryPct: total ? Math.round((firstTryCorrect / total) * 100) : 0,
    catalogMatchRate: total ? Math.round((matches / total) * 100) : 0,
    mostMissed,
    confidenceBuckets: buckets,
    catalog: catalog ?? [],
  });
}
