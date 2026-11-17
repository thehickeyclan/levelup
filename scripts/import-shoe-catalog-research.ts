/**
 * Merge researched shoe-catalog entries into wrestling_shoes_catalog.
 *
 *   npx tsx scripts/import-shoe-catalog-research.ts <entries.json>          # dry run
 *   npx tsx scripts/import-shoe-catalog-research.ts <entries.json> --write  # apply
 *
 * Rules:
 * - A model is matched by brand + model (case-insensitive), with each side's
 *   aliases checked both ways. New models insert with source 'research'.
 * - Existing rows are ENRICHED, never overwritten: a researched value lands
 *   only where the current field is null/empty. Verified rows are never touched.
 * - Colorways merge (union, case-insensitive).
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

type Researched = {
  brand?: string;
  model?: string;
  model_aliases?: string[];
  years_produced?: string | null;
  original_msrp_cents?: number | null;
  colorways?: string[];
  rarity?: string | null;
  value_low_cents?: number | null;
  value_mid_cents?: number | null;
  value_high_cents?: number | null;
  collector_notes?: string | null;
  history_text?: string | null;
  reference_url?: string | null;
  confidence?: string;
};

const RARITIES = new Set(['common', 'uncommon', 'rare', 'grail']);
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function namesFor(brand: string, model: string, aliases: string[] | null | undefined): Set<string> {
  const names = new Set<string>();
  names.add(`${norm(brand)}|${norm(model)}`);
  for (const alias of aliases ?? []) names.add(`${norm(brand)}|${norm(alias)}`);
  return names;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const files = args.filter((a) => a !== '--write');
  if (!files.length) {
    console.error('Usage: tsx scripts/import-shoe-catalog-research.ts <entries.json> [more.json…] [--write]');
    process.exit(1);
  }
  const raw = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Researched[]);

  const entries = raw.filter((e) => {
    if (!e.brand?.trim() || !e.model?.trim()) return false;
    if (e.rarity && !RARITIES.has(norm(e.rarity))) e.rarity = null;
    if (norm(e.confidence) === 'low') {
      // Low-confidence research still inserts names/years, but no values —
      // a wrong price in the catalog poisons the AI estimates.
      e.value_low_cents = null;
      e.value_mid_cents = null;
      e.value_high_cents = null;
    }
    return true;
  });

  const { data: existing, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, model_aliases, years_produced, colorways, rarity, collector_notes, history_text, original_msrp_cents, value_low_cents, value_mid_cents, value_high_cents, reference_url, verified');
  if (error) throw error;

  const index = new Map<string, (typeof existing)[number]>();
  for (const row of existing ?? []) {
    for (const name of namesFor(row.brand, row.model, row.model_aliases)) index.set(name, row);
  }

  let inserts = 0;
  let enriched = 0;
  let skippedVerified = 0;
  let unchanged = 0;

  for (const e of entries) {
    let match: (typeof existing)[number] | undefined;
    for (const name of namesFor(e.brand!, e.model!, e.model_aliases)) {
      match = index.get(name);
      if (match) break;
    }

    if (!match) {
      inserts += 1;
      console.log(`INSERT  ${e.brand} ${e.model}  [${e.rarity ?? '—'}]`);
      const rowValues = {
        brand: e.brand!.trim(),
        model: e.model!.trim(),
        model_aliases: e.model_aliases ?? [],
        years_produced: e.years_produced ?? null,
        colorways: e.colorways ?? [],
        rarity: e.rarity ? norm(e.rarity) : null,
        value_low_cents: e.value_low_cents ?? null,
        value_mid_cents: e.value_mid_cents ?? null,
        value_high_cents: e.value_high_cents ?? null,
        collector_notes: e.collector_notes ?? null,
        history_text: e.history_text ?? null,
        original_msrp_cents: e.original_msrp_cents ?? null,
        reference_url: e.reference_url ?? null,
        source: 'research',
        source_notes: `web research ${new Date().toISOString().slice(0, 10)}; confidence ${e.confidence ?? 'unstated'}`,
        verified: false,
      };
      // The new row joins the match index so a later file's duplicate of the
      // same model enriches it instead of inserting again.
      let insertedId = `dry-run-${inserts}`;
      if (write) {
        const { data: ins, error: insErr } = await admin
          .from('wrestling_shoes_catalog')
          .insert(rowValues)
          .select('id')
          .single();
        if (insErr || !ins) {
          console.error(`  FAILED: ${insErr?.message}`);
          continue;
        }
        insertedId = ins.id as string;
      }
      const newRow = { id: insertedId, ...rowValues } as (typeof existing)[number];
      for (const name of namesFor(newRow.brand, newRow.model, newRow.model_aliases)) {
        if (!index.has(name)) index.set(name, newRow);
      }
      continue;
    }

    if (match.verified) {
      skippedVerified += 1;
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (!match.years_produced && e.years_produced) patch.years_produced = e.years_produced;
    if (!match.rarity && e.rarity) patch.rarity = norm(e.rarity);
    if (!match.collector_notes && e.collector_notes) patch.collector_notes = e.collector_notes;
    if (!match.history_text && e.history_text) patch.history_text = e.history_text;
    if (!match.original_msrp_cents && e.original_msrp_cents) patch.original_msrp_cents = e.original_msrp_cents;
    if (!match.value_mid_cents && e.value_mid_cents) {
      patch.value_low_cents = e.value_low_cents ?? null;
      patch.value_mid_cents = e.value_mid_cents;
      patch.value_high_cents = e.value_high_cents ?? null;
    }
    if (!match.reference_url && e.reference_url) patch.reference_url = e.reference_url;
    const existingColorways = new Set((Array.isArray(match.colorways) ? match.colorways : []).map((c: unknown) => norm(String(c))));
    const newColorways = (e.colorways ?? []).filter((c) => !existingColorways.has(norm(c)));
    if (newColorways.length) {
      patch.colorways = [...(Array.isArray(match.colorways) ? match.colorways : []), ...newColorways];
    }

    if (!Object.keys(patch).length) {
      unchanged += 1;
      continue;
    }

    enriched += 1;
    console.log(`ENRICH  ${match.brand} ${match.model}  +${Object.keys(patch).join(', +')}`);
    if (write) {
      const { error: upErr } = await admin
        .from('wrestling_shoes_catalog')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', match.id);
      if (upErr) console.error(`  FAILED: ${upErr.message}`);
    }
  }

  console.log(
    `\n${write ? 'APPLIED' : 'DRY RUN'}: ${inserts} inserts, ${enriched} enriched, ${unchanged} already complete, ${skippedVerified} verified rows left alone (of ${entries.length} researched entries)`
  );
}

void main();
