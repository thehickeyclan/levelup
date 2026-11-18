/**
 * Set live manufacturer prices on in-production catalog models
 * (catalog_price_cents + price_source), checked 2026-11-18.
 *
 *   npx tsx scripts/apply-current-retail-2026-11-18.ts          # dry run
 *   npx tsx scripts/apply-current-retail-2026-11-18.ts --write  # apply
 *
 * Only models continuously buyable at the manufacturer's own store count.
 * Drop-based brands (ONEV) and clearance stragglers (adidas CS5) stay out —
 * a sold-out drop trades above retail, and a clearance price isn't a value.
 */
import { createAdminClient } from '../lib/supabase/admin';

const WRITE = process.argv.includes('--write');
const admin = createAdminClient('guild');

const RETAIL: { brand: string; model: string; cents: number; source: string }[] = [
  { brand: 'Nidrogen', model: 'GEN-ONE', cents: 9999, source: 'Nidrogen store' },
  { brand: 'Nidrogen', model: 'PRO-GEN', cents: 14999, source: 'Nidrogen store' },
  { brand: 'Nidrogen', model: 'AERO', cents: 12999, source: 'Nidrogen store' },
  { brand: 'Spartan', model: 'YIANNI', cents: 14000, source: 'spartan.com' },
  { brand: 'Spartan', model: 'DAKE', cents: 15500, source: 'spartan.com' },
  { brand: 'Spartan', model: 'DAKE 1.5', cents: 15500, source: 'spartan.com' },
  { brand: 'RUDIS', model: 'JB1', cents: 12000, source: 'rudis.com' },
  { brand: 'Nike', model: 'Tawa', cents: 15000, source: 'nike.com' },
];

async function main() {
  const { data } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, catalog_price_cents, price_source')
    .order('id')
    .limit(2000);
  const rows = data ?? [];
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

  for (const r of RETAIL) {
    const row = rows.find((x) => norm(x.brand) === norm(r.brand) && norm(x.model) === norm(r.model));
    if (!row) {
      console.log(`MISSING catalog row: ${r.brand} ${r.model}`);
      continue;
    }
    console.log(
      `${WRITE ? 'WRITE' : 'DRY'} ${r.brand} ${r.model}: $${(r.cents / 100).toFixed(2)} (${r.source})` +
        (row.catalog_price_cents ? ` [was ${row.catalog_price_cents}]` : '')
    );
    if (WRITE) {
      const { error } = await admin
        .from('wrestling_shoes_catalog')
        .update({
          catalog_price_cents: r.cents,
          price_source: r.source,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id as string);
      if (error) throw error;
    }
  }
  console.log(WRITE ? 'Applied.' : 'Dry run complete — re-run with --write to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
