/**
 * Log the three Committed Wrestling Shoes sold posts Matt supplied 2026-11-18
 * as documented evidence (IG sold posts are sold evidence, priced with dates).
 *
 *   npx tsx scripts/apply-committed-evidence-2026-11-18.ts          # dry run
 *   npx tsx scripts/apply-committed-evidence-2026-11-18.ts --write  # apply
 *
 * - Dan Gable Classic: $227 (Silver/Black, 11.5, 2026-05-13) and $287
 *   (Black/Gold 2003, sz 7, near-new, 2026-04-13) — the row held zero comps.
 * - CS4 "Orange / Black / White" profile notes gain the $438 sold post
 *   (NEW OG 4 2015, sz 8, 2026-02-23) beside Matt's $400 purchase.
 */
import { createAdminClient } from '../lib/supabase/admin';

const WRITE = process.argv.includes('--write');
const admin = createAdminClient('guild');

async function main() {
  const { data } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, sale_comps, colorway_profiles')
    .order('id')
    .limit(2000);
  const rows = data ?? [];

  // 1. Dan Gable Classic sold comps.
  const dgc = rows.find((r) => (r.id as string).startsWith('6460dbcf'));
  if (!dgc) throw new Error('Dan Gable Classic row not found');
  const existing = (dgc.sale_comps ?? []) as Record<string, unknown>[];
  const newComps = [
    {
      sold_price_cents: 22700,
      condition: 'good',
      source: 'IG @committed',
      colorway: 'Silver/Black',
      size_us: 11.5,
      sold_date: '2026-05-13',
      notes: 'Committed sold post https://www.instagram.com/p/DYSRRoBEWv7/',
    },
    {
      sold_price_cents: 28700,
      condition: 'like_new',
      source: 'IG @committed',
      colorway: 'Black/Gold',
      size_us: 7,
      sold_date: '2026-04-13',
      notes: '2003 pair, near new — Committed sold post https://www.instagram.com/p/DXFnZyuCXuc/',
    },
  ].filter(
    (c) => !existing.some((e) => e.sold_price_cents === c.sold_price_cents && e.sold_date === c.sold_date)
  );
  console.log(`${WRITE ? 'WRITE' : 'DRY'} Dan Gable Classic: +${newComps.length} comps (had ${existing.length})`);
  if (WRITE && newComps.length) {
    const { error } = await admin
      .from('wrestling_shoes_catalog')
      .update({ sale_comps: [...existing, ...newComps], updated_at: new Date().toISOString() })
      .eq('id', dgc.id as string);
    if (error) throw error;
  }

  // 2. CS4 Orange/Black/White profile: the exact-colorway sold post.
  const cs4 = rows.find((r) => (r.id as string).startsWith('b5ff681a'));
  if (!cs4) throw new Error('CS4 row not found');
  const profiles = (cs4.colorway_profiles ?? []) as Record<string, unknown>[];
  const idx = profiles.findIndex(
    (p) => String(p.name ?? '').trim().toLowerCase() === 'orange / black / white'
  );
  if (idx < 0) throw new Error('Orange / Black / White profile missing');
  profiles[idx] = {
    ...profiles[idx],
    notes:
      'Rare-tier colorway on an inverted model. Documented sales: $438 NEW sz 8 on Committed 2026-02-23 (https://www.instagram.com/p/DVHEGgdiXjQ/); Matt purchased his BNIB sz 8 pair there for $400 (2026). Sits at or above the used-pool reference.',
  };
  console.log(`${WRITE ? 'WRITE' : 'DRY'} CS4 Orange/Black/White: notes carry the $438 Committed sold post`);
  if (WRITE) {
    const { error } = await admin
      .from('wrestling_shoes_catalog')
      .update({ colorway_profiles: profiles, updated_at: new Date().toISOString() })
      .eq('id', cs4.id as string);
    if (error) throw error;
  }

  console.log(WRITE ? 'Applied.' : 'Dry run complete — re-run with --write to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
