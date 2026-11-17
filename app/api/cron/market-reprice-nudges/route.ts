import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenants } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';
import { fetchRepriceEvaluation, repriceNudgeCopy } from '@/lib/market/reprice-nudge';
import { NOTIFICATION_RETENTION_DAYS } from '@/lib/notification-retention';

export const maxDuration = 300;

// The dedupe ledger IS the notifications table, so the cooldown can never
// exceed how long those rows live.
const RENUDGE_COOLDOWN_DAYS = NOTIFICATION_RETENTION_DAYS;
const MAX_NUDGES_PER_RUN = 50;
const MAX_LISTINGS_PER_TENANT = 400;

function listingTitle(row: { title?: string | null; brand?: string | null; model?: string | null }) {
  return (
    row.title?.trim() || [row.brand, row.model].filter(Boolean).join(' ') || 'Your listing'
  );
}

/**
 * Weekly: nudge sellers whose ask sits far above the sold-price reference.
 * Every gate lives in lib/market/reprice-nudge.ts — misfiled listings,
 * premium colorways, modified pairs and thin evidence are all spared, so a
 * nudge that does arrive is one the seller can act on.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<
    string,
    { scanned: number; nudged: number; skipped: Record<string, number> }
  > = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    const skipped: Record<string, number> = {};
    let nudged = 0;

    // Listings nudged inside the cooldown window never get a second nudge.
    const since = new Date(
      Date.now() - RENUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: recentNudges } = await admin
      .from('notifications')
      .select('data')
      .eq('type', 'market_reprice_nudge')
      .gte('created_at', since)
      .order('id')
      .limit(1000);
    const recentlyNudged = new Set(
      (recentNudges ?? [])
        .map((n) => (n.data as { listing_id?: string } | null)?.listing_id)
        .filter(Boolean) as string[]
    );

    const { data: listings } = await admin
      .from('market_listings')
      .select('*')
      .eq('status', 'active')
      .eq('listing_type', 'sell')
      .gt('price_cents', 0)
      .order('id')
      .limit(MAX_LISTINGS_PER_TENANT);

    const rows = listings ?? [];
    for (const row of rows) {
      if (nudged >= MAX_NUDGES_PER_RUN) break;
      const id = row.id as string;
      if (recentlyNudged.has(id)) {
        skipped['recently nudged'] = (skipped['recently nudged'] ?? 0) + 1;
        continue;
      }

      const { verdict } = await fetchRepriceEvaluation(admin, {
        id,
        brand: row.brand as string | null,
        model: row.model as string | null,
        colorway: (row.colorway as string | null) ?? null,
        price_cents: (row.price_cents as number | null) ?? null,
        wear_state: (row.wear_state as string | null) ?? null,
        condition: (row.condition as string | null) ?? null,
        disclosure_tags: (row.disclosure_tags as string[] | null) ?? null,
      });

      if (!verdict.fire) {
        skipped[verdict.reason] = (skipped[verdict.reason] ?? 0) + 1;
        continue;
      }

      const copy = repriceNudgeCopy(
        listingTitle(row as { title?: string | null; brand?: string | null; model?: string | null }),
        row.price_cents as number,
        verdict
      );
      await createNotification(admin, {
        user_id: row.seller_id as string,
        type: 'market_reprice_nudge',
        title: copy.title,
        body: copy.body,
        data: {
          listing_id: id,
          listingId: id,
          link: `/market/listing/${id}`,
          ratio: Number(verdict.ratio.toFixed(2)),
          reference_mid_cents: verdict.reference.mid_cents,
        },
      });
      nudged += 1;
    }

    results[slug] = { scanned: rows.length, nudged, skipped };
  }

  return NextResponse.json({ ok: true, results });
}
