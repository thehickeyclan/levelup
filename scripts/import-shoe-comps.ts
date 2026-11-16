/**
 * Import eBay sold comps (research CSV) into wrestling_shoes_catalog.sale_comps.
 *
 *   npx tsx scripts/import-shoe-comps.ts <shoe-sold-comps.csv>          # dry run
 *   npx tsx scripts/import-shoe-comps.ts <shoe-sold-comps.csv> --write  # apply
 *
 * CSV columns: brand,model,sold_price_usd,sold_date,size,condition,colorway,listing_title,listing_url
 *
 * Rules:
 * - Models match by brand + model against catalog model + aliases (case-insensitive).
 * - New comps merge with existing ones, deduped by eBay URL, newest first, capped
 *   at 20 per model (the admin schema cap). Existing undated comps sort last.
 * - "NO SOLD RESULTS" rows don't become comps; they append a scarcity note to
 *   source_notes instead (useful signal for pricing).
 * - Comps are market data, not identity, so verified rows DO take comps.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env. Run with: set -a && source .env.local && set +a');
  process.exit(1);
}
const admin = createClient(url, key);

const MAX_COMPS = 20;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

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

type Comp = {
  sold_price_cents: number;
  condition?: string;
  colorway?: string;
  size_us?: number;
  source: string;
  notes: string;
  sold_date?: string;
};

function parsePrice(raw: string): { cents: number; rangeNote?: string } | null {
  const s = raw.trim().replace(/[$,]/g, '');
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const low = parseFloat(range[1]);
    const high = parseFloat(range[2]);
    return { cents: Math.round(((low + high) / 2) * 100), rangeNote: `listed range $${range[1]}–$${range[2]}` };
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { cents: Math.round(n * 100) };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = args.find((a) => a !== '--write');
  if (!file) {
    console.error('Usage: tsx scripts/import-shoe-comps.ts <shoe-sold-comps.csv> [--write]');
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = rows[0].map(norm);
  const col = (name: string) => header.indexOf(name);
  const iBrand = col('brand');
  const iModel = col('model');
  const iPrice = col('sold_price_usd');
  const iDate = col('sold_date');
  const iSize = col('size');
  const iCond = col('condition');
  const iColor = col('colorway');
  const iTitle = col('listing_title');
  const iUrl = col('listing_url');
  if ([iBrand, iModel, iPrice, iDate, iTitle, iUrl].includes(-1)) {
    console.error('CSV header missing expected columns');
    process.exit(1);
  }

  const { data: catalog, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, model_aliases, verified, sale_comps, source_notes')
    .order('id');
  if (error) throw error;

  const index = new Map<string, (typeof catalog)[number]>();
  for (const r of catalog ?? []) {
    index.set(`${norm(r.brand)}|${norm(r.model)}`, r);
    for (const a of r.model_aliases ?? []) index.set(`${norm(r.brand)}|${norm(a)}`, r);
  }

  const compsByRow = new Map<string, { row: (typeof catalog)[number]; comps: Comp[] }>();
  const noSold: { row: (typeof catalog)[number]; label: string }[] = [];
  const unmatched = new Set<string>();
  let skippedBadPrice = 0;

  for (const r of rows.slice(1)) {
    if (r.length < 2 || !r[iBrand]?.trim()) continue;
    const brand = r[iBrand].trim();
    const model = r[iModel].trim();
    const match = index.get(`${norm(brand)}|${norm(model)}`);
    if (!match) {
      unmatched.add(`${brand} ${model}`);
      continue;
    }
    const title = (r[iTitle] ?? '').trim();
    if (title === 'NO SOLD RESULTS') {
      noSold.push({ row: match, label: `${brand} ${model}` });
      continue;
    }
    const price = parsePrice(r[iPrice] ?? '');
    if (!price) {
      skippedBadPrice += 1;
      continue;
    }
    const soldDate = (r[iDate] ?? '').trim();
    const listingUrl = (r[iUrl] ?? '').trim();
    const caveat = title.match(/\[([^\]]+)\]/)?.[1]?.trim();
    const noteParts = [soldDate ? `sold ${soldDate}` : null, listingUrl || null, price.rangeNote ?? null, caveat ?? null].filter(Boolean);
    const sizeNum = parseFloat((r[iSize] ?? '').trim());
    const comp: Comp = {
      sold_price_cents: price.cents,
      source: 'ebay',
      notes: noteParts.join(' — '),
      ...(soldDate ? { sold_date: soldDate } : {}),
      ...((r[iCond] ?? '').trim() ? { condition: r[iCond].trim() } : {}),
      ...((r[iColor] ?? '').trim() ? { colorway: r[iColor].trim() } : {}),
      ...(Number.isFinite(sizeNum) && sizeNum > 0 && /^\d+(\.\d+)?$/.test((r[iSize] ?? '').trim()) ? { size_us: sizeNum } : {}),
    };
    const bucket = compsByRow.get(match.id) ?? { row: match, comps: [] };
    bucket.comps.push(comp);
    compsByRow.set(match.id, bucket);
  }

  let updated = 0;
  for (const { row, comps } of compsByRow.values()) {
    // Newest first; merge in existing comps that aren't already covered by URL.
    comps.sort((a, b) => (b.sold_date ?? '').localeCompare(a.sold_date ?? ''));
    const seenUrls = new Set(
      comps.map((c) => c.notes.match(/https?:\/\/\S+/)?.[0]).filter(Boolean) as string[]
    );
    const existing = (Array.isArray(row.sale_comps) ? row.sale_comps : []) as Comp[];
    const kept = existing.filter((c) => {
      const u = typeof c.notes === 'string' ? c.notes.match(/https?:\/\/\S+/)?.[0] : null;
      return !u || !seenUrls.has(u);
    });
    const merged = [...comps, ...kept].slice(0, MAX_COMPS);
    updated += 1;
    console.log(
      `COMPS   ${row.brand} ${row.model}${row.verified ? ' [verified]' : ''}: ${comps.length} new + ${kept.length} kept → ${merged.length} stored`
    );
    if (write) {
      const { error: upErr } = await admin
        .from('wrestling_shoes_catalog')
        .update({ sale_comps: merged, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (upErr) console.error(`  FAILED: ${upErr.message}`);
    }
  }

  let noted = 0;
  for (const { row, label } of noSold) {
    const note = 'no eBay sold results in ~90-day window (research Nov 2026) — scarce on the secondary market';
    if ((row.source_notes ?? '').includes('no eBay sold results')) continue;
    noted += 1;
    console.log(`NO-SOLD ${label}: appending scarcity note to source_notes`);
    if (write) {
      const { error: upErr } = await admin
        .from('wrestling_shoes_catalog')
        .update({
          source_notes: row.source_notes ? `${row.source_notes}; ${note}` : note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) console.error(`  FAILED: ${upErr.message}`);
    }
  }

  if (unmatched.size) {
    console.log('\nUNMATCHED models (no catalog row):');
    for (const u of unmatched) console.log(`  ${u}`);
  }
  console.log(
    `\n${write ? 'APPLIED' : 'DRY RUN'}: ${updated} models updated with comps, ${noted} scarcity notes, ${skippedBadPrice} rows skipped (unparsable price), ${unmatched.size} unmatched models`
  );
}

void main();
