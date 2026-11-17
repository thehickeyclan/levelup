/**
 * Build lib/market/data/ig-price-history.json from the Instagram resale
 * ledger CSVs (Muse's @committed_wrestling_shoes + @drewrestler_shoes_
 * pulls, ~9,000 posts 2018–2026).
 *
 *   npx tsx scripts/build-ig-price-history.ts <committed.csv> <drew.csv> [--write]
 *
 * CSV columns: date,status,shoe,size,price_usd,price_terms,post_url
 *
 * These are LISTED prices as captioned (for Committed's Sold posts that is
 * the price it moved at; Drew strips prices when sold). Per the standing
 * rule they are a secondary cross-check — they never enter sale_comps.
 * Captions are matched against catalog model + alias names via
 * lib/market/ig-caption-match; unmatched captions (apparel, promos,
 * stylized-font rows) are dropped and reported.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildCaptionIndex, matchCaption } from '../lib/market/ig-caption-match';

const url = process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env. Run with: set -a && source .env.local && set +a');
  process.exit(1);
}
const admin = createClient(url, key);

// Caption spellings the catalog aliases don't carry. Each maps to an exact
// existing catalog row; typos here fail loudly (the index skips unknown rows
// and the caption shows up as unmatched).
const EXTRA_ALIASES: Record<string, { brand: string; model: string }> = {
  // Olympic-edition Inflicts titled by games year (Muse: one canonical OE row).
  'Tokyo Inflict': { brand: 'Nike', model: 'Inflict OE (Olympic Edition)' },
  'Paris Inflict': { brand: 'Nike', model: 'Inflict OE (Olympic Edition)' },
  // Captions drop "Dan" from the Gable lines.
  'Gable Ultimate': { brand: 'Asics', model: 'Dan Gable Ultimate' },
  'Gable Classic': { brand: 'Asics', model: 'Dan Gable Classic' },
  'Gable Evo': { brand: 'Asics', model: 'Dan Gable Evo' },
  'Gable Evo 2': { brand: 'Asics', model: 'Dan Gable Evo 2' },
  'Gable Evo 3': { brand: 'Asics', model: 'Dan Gable EVO 3' },
  // Roman-numeral titles the catalog aliases don't carry.
  'Combat Speed II': { brand: 'Adidas', model: 'Combat Speed 2' },
  'Combat Speed III': { brand: 'Adidas', model: 'Combat Speed 3' },
  // Catalog's Split Second row is the multi-generation bucket (V–VII aliased).
  'Split Second II': { brand: 'Asics', model: 'Split Second' },
  'Split Second III': { brand: 'Asics', model: 'Split Second' },
  'Split Second IV': { brand: 'Asics', model: 'Split Second' },
  'Split Second 2': { brand: 'Asics', model: 'Split Second' },
  'Split Second 3': { brand: 'Asics', model: 'Split Second' },
  'Split Second 4': { brand: 'Asics', model: 'Split Second' },
  'Split Second 5': { brand: 'Asics', model: 'Split Second' },
  'Split Second 6': { brand: 'Asics', model: 'Split Second' },
  'Split Second 7': { brand: 'Asics', model: 'Split Second' },
  // Row spans original + V2.0 per catalog note.
  'Omniflex Attack 2': { brand: 'Asics', model: 'Omniflex-Attack' },
  'Omniflex Attack V2': { brand: 'Asics', model: 'Omniflex-Attack' },
  // Only Tawa home in the catalog is the TAWA SE row.
  Tawa: { brand: 'Nike', model: 'TAWA SE' },
  // Vintage OT catch-all row; Mexico Mid titles match their own longer name.
  'Onitsuka Tiger': { brand: 'Onitsuka Tiger', model: 'Vintage Wrestling Boots (incl. Tiger 81)' },
  // "Adidas Canvas (2003)" / "Adidas CVS" titles.
  Canvas: { brand: 'Adidas', model: 'Canvas CVS' },
  CVS: { brand: 'Adidas', model: 'Canvas CVS' },
  'KS Infinity': { brand: 'RUDIS', model: 'KS Infinity Edge' },
  'Takedown III': { brand: 'Nike', model: 'Takedown 3' },
  'Takedown IV': { brand: 'Nike', model: 'Takedown 4' },
  'Takedown V': { brand: 'Nike', model: 'Takedown 5' },
  // Seller shorthand for Combat Speeds.
  'Combat 4': { brand: 'Adidas', model: 'Combat Speed 4' },
  'Combat 5': { brand: 'Adidas', model: 'Combat Speed 5' },
  // Grail titles: "West German Combat Speed 88's", "OG 1988 Combats".
  'Combat Speed 88': { brand: 'Adidas', model: 'Combat Speed OG (1988 West German)' },
  'West German Combat Speed': { brand: 'Adidas', model: 'Combat Speed OG (1988 West German)' },
  '1988 Combat': { brand: 'Adidas', model: 'Combat Speed OG (1988 West German)' },
  // Only Kolat model in the catalog ("NEW Nike Illinois Kolats" etc.).
  Kolat: { brand: 'Nike', model: 'Kolat 2000' },
  'Illinois Kolat': { brand: 'Nike', model: 'Kolat 2000' },
};

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

type Post = { date: string; status: string; price: number | null; account: string };

function statusKind(s: string): 'sold' | 'available' | 'unknown' {
  const t = s.toLowerCase();
  if (t.includes('sold') || t.includes('gone')) return 'sold';
  if (t.includes('avail')) return 'available';
  return 'unknown';
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const files = args.filter((a) => a !== '--write');
  if (files.length < 1) {
    console.error('Usage: tsx scripts/build-ig-price-history.ts <csv> [<csv> ...] [--write]');
    process.exit(1);
  }

  const { data: catalog, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, model_aliases')
    .order('id');
  if (error) throw error;
  const index = buildCaptionIndex(catalog ?? [], EXTRA_ALIASES);

  const byRow = new Map<string, { brand: string; model: string; posts: Post[] }>();
  const unmatched = new Map<string, number>();
  let total = 0;
  let matched = 0;
  const accountTotals: Record<string, { posts: number; first: string; last: string }> = {};

  for (const file of files) {
    const account = path.basename(file).includes('drew') ? 'drewrestler_shoes_' : 'committed_wrestling_shoes';
    const rows = parseCsv(readFileSync(file, 'utf8'));
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n: string) => header.indexOf(n);
    const iDate = col('date');
    const iStatus = col('status');
    const iShoe = col('shoe');
    const iPrice = col('price_usd');
    if ([iDate, iStatus, iShoe, iPrice].includes(-1)) {
      console.error(`${file}: header missing expected columns`);
      process.exit(1);
    }
    for (const r of rows.slice(1)) {
      const shoe = (r[iShoe] ?? '').trim();
      if (!shoe) continue;
      // Video series, giveaways and contests are content, not sales
      // (e.g. Drew's "$20 to 1988 Combats" trade-up challenge at $20).
      if (/\b(challenge|series|part \d+|giveaway|subscribe|winner)\b/i.test(shoe)) continue;
      total += 1;
      const date = (r[iDate] ?? '').trim();
      if (date) {
        const t = (accountTotals[account] ??= { posts: 0, first: date, last: date });
        t.posts += 1;
        if (date < t.first) t.first = date;
        if (date > t.last) t.last = date;
      }
      const m = matchCaption(shoe, index);
      if (!m) {
        unmatched.set(shoe, (unmatched.get(shoe) ?? 0) + 1);
        continue;
      }
      matched += 1;
      const priceNum = parseFloat((r[iPrice] ?? '').replace(/[$,]/g, ''));
      // $5,000+ rows are contest promos / bundles, never one pair's price.
      const price = Number.isFinite(priceNum) && priceNum > 0 && priceNum < 5000 ? priceNum : null;
      const bucket = byRow.get(m.row.id) ?? { brand: m.row.brand, model: m.row.model, posts: [] };
      bucket.posts.push({ date, status: (r[iStatus] ?? '').trim(), price, account });
      byRow.set(m.row.id, bucket);
    }
  }

  const cutoff24 = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const models: Record<string, unknown> = {};
  const aliasKeys: Record<string, string> = {};
  for (const { brand, model, posts } of byRow.values()) {
    const key = `${brand.toLowerCase()}|${model.toLowerCase()}`;
    const priced = posts.filter((p) => p.price != null) as (Post & { price: number })[];
    if (!posts.length) continue;
    const prices = priced.map((p) => p.price);
    const recent = priced.filter((p) => p.date >= cutoff24).map((p) => p.price);
    const dates = posts.map((p) => p.date).filter(Boolean).sort();
    const latest = priced
      .filter((p) => p.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map((p) => ({ date: p.date, price_usd: p.price, status: statusKind(p.status) }));
    models[key] = {
      brand,
      model,
      posts: posts.length,
      priced: priced.length,
      sold_priced: priced.filter((p) => statusKind(p.status) === 'sold').length,
      median_usd: prices.length ? median(prices) : null,
      median_recent_24mo_usd: recent.length >= 3 ? median(recent) : null,
      min_usd: prices.length ? Math.min(...prices) : null,
      max_usd: prices.length ? Math.max(...prices) : null,
      first_date: dates[0] ?? null,
      last_date: dates[dates.length - 1] ?? null,
      latest,
    };
  }
  // Alias keys so runtime lookups by an alias spelling still land.
  for (const row of catalog ?? []) {
    const canonical = `${row.brand.toLowerCase()}|${row.model.toLowerCase()}`;
    if (!models[canonical]) continue;
    for (const a of row.model_aliases ?? []) {
      const k = `${row.brand.toLowerCase()}|${a.toLowerCase()}`;
      if (!models[k]) aliasKeys[k] = canonical;
    }
  }

  const out = {
    generated_at: new Date().toISOString().slice(0, 10),
    note: 'Listed/asking prices from the two largest IG wrestling-shoe resale accounts, 2018–2026. Secondary cross-check only — Guild sales and eBay sold comps govern.',
    sources: Object.entries(accountTotals).map(([account, t]) => ({ account, ...t })),
    models,
    alias_keys: aliasKeys,
  };

  const topUnmatched = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  console.log(`${matched}/${total} captions matched to ${byRow.size} catalog models`);
  console.log(`unmatched distinct captions: ${unmatched.size}; top repeats:`);
  for (const [cap, n] of topUnmatched) if (n > 1) console.log(`  ${n}× ${cap.slice(0, 80)}`);

  if (write) {
    const dest = path.join(__dirname, '..', 'lib', 'market', 'data', 'ig-price-history.json');
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(out, null, 1));
    console.log(`\nWROTE ${dest} (${Object.keys(models).length} models)`);
  } else {
    console.log('\nDRY RUN — pass --write to emit lib/market/data/ig-price-history.json');
  }
}

void main();
