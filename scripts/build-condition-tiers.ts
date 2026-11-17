/**
 * Build lib/market/data/ebay-condition-tiers.json from Muse's price-index v2
 * (per-condition eBay sold tiers per catalog model).
 *
 *   npx tsx scripts/build-condition-tiers.ts <price-index-v2.csv> [--write]
 *
 * Rows are keyed by catalog brand|model; catalog aliases are emitted so a
 * lookup by an alias spelling still lands. Models in the CSV that no longer
 * exist in the catalog (merged rows) are reported, not silently dropped.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env. Run with: set -a && source .env.local && set +a');
  process.exit(1);
}
const admin = createClient(url, key);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const num = (s: string | undefined) => {
  const n = parseFloat((s ?? '').trim());
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = args.find((a) => a !== '--write');
  if (!file) {
    console.error('Usage: tsx scripts/build-condition-tiers.ts <price-index-v2.csv> [--write]');
    process.exit(1);
  }

  const { data: catalog, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('brand, model, model_aliases');
  if (error) throw error;
  const canonical = new Set((catalog ?? []).map((r) => `${r.brand.toLowerCase()}|${r.model.toLowerCase()}`));
  const canonicalNames = new Map(
    (catalog ?? []).map((r) => [`${r.brand.toLowerCase()}|${r.model.toLowerCase()}`, { brand: r.brand as string, model: r.model as string }])
  );
  // The CSV predates ~20 catalog merges — remap old names through aliases.
  const aliasToCanonical = new Map<string, string>();
  for (const row of catalog ?? []) {
    const canonicalKey = `${row.brand.toLowerCase()}|${row.model.toLowerCase()}`;
    for (const a of row.model_aliases ?? []) {
      aliasToCanonical.set(`${row.brand.toLowerCase()}|${a.toLowerCase()}`, canonicalKey);
    }
  }

  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => header.indexOf(n);
  const get = (r: string[], n: string) => r[col(n)];

  const models: Record<string, unknown> = {};
  const notInCatalog: string[] = [];
  let withTiers = 0;

  for (const r of rows.slice(1)) {
    const brand = (get(r, 'brand') ?? '').trim();
    const model = (get(r, 'model') ?? '').trim();
    if (!brand || !model) continue;
    let keyBM = `${brand.toLowerCase()}|${model.toLowerCase()}`;
    if (!canonical.has(keyBM)) {
      const remapped = aliasToCanonical.get(keyBM);
      if (remapped) keyBM = remapped;
      else notInCatalog.push(`${brand} ${model}`);
    }

    const tiers: Record<string, { n: number; median_usd: number }> = {};
    for (const tier of ['new', 'like_new', 'good', 'worn'] as const) {
      const n = num(get(r, `ebay_${tier}_n`));
      const median = num(get(r, `ebay_${tier}_median`));
      if (n && median != null) tiers[tier] = { n, median_usd: median };
    }
    const premium = num(get(r, 'bnib_premium_vs_good'));
    const flag = (get(r, 'condition_flag') ?? '').trim() || null;
    if (!Object.keys(tiers).length && premium == null && !flag) continue;
    // Two CSV rows can remap to one canonical model (e.g. Combat Speed IV →
    // Combat Speed 4). Medians can't be merged, so the richer row wins.
    const totalN = Object.values(tiers).reduce((s, t) => s + t.n, 0);
    const existing = models[keyBM] as { tiers?: Record<string, { n: number }> } | undefined;
    const existingN = existing
      ? Object.values(existing.tiers ?? {}).reduce((s, t) => s + t.n, 0)
      : -1;
    if (existing && existingN >= totalN) continue;
    if (!existing) withTiers += 1;
    const names = canonicalNames.get(keyBM) ?? { brand, model };
    models[keyBM] = {
      brand: names.brand,
      model: names.model,
      tiers,
      ...(premium != null ? { bnib_premium_vs_good: premium } : {}),
      ...(flag ? { condition_flag: flag } : {}),
    };
  }

  // Alias keys from the catalog so alias-spelled lookups land.
  const aliasKeys: Record<string, string> = {};
  for (const row of catalog ?? []) {
    const canonicalKey = `${row.brand.toLowerCase()}|${row.model.toLowerCase()}`;
    if (!models[canonicalKey]) continue;
    for (const a of row.model_aliases ?? []) {
      const k = `${row.brand.toLowerCase()}|${a.toLowerCase()}`;
      if (!models[k]) aliasKeys[k] = canonicalKey;
    }
  }

  console.log(`${withTiers} models with condition data; ${notInCatalog.length} CSV rows not in catalog:`);
  for (const n of notInCatalog) console.log(`  ${n}`);

  const out = {
    generated_at: new Date().toISOString().slice(0, 10),
    note: 'Per-condition eBay sold tiers per catalog model (Muse price-index v2, 17 Nov 2026). INVERTED flag: the used pool carries rarer colorways — never apply a flat BNIB premium.',
    models,
    alias_keys: aliasKeys,
  };

  if (write) {
    const dest = path.join(__dirname, '..', 'lib', 'market', 'data', 'ebay-condition-tiers.json');
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(out, null, 1));
    console.log(`\nWROTE ${dest}`);
  } else {
    console.log('\nDRY RUN — pass --write to emit the JSON');
  }
}

void main();
