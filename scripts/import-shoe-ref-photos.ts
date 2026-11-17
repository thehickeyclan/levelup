/**
 * Upload researched reference photos to storage and wire them into
 * wrestling_shoes_catalog.reference_image_urls.
 *
 *   npx tsx scripts/import-shoe-ref-photos.ts <photos-root> <photo-sources.csv>          # dry run
 *   npx tsx scripts/import-shoe-ref-photos.ts <photos-root> <photo-sources.csv> --write  # apply
 *
 * <photos-root> holds the extracted brand folders (any nesting); files follow
 * brand-model-angle[-N].jpg. Every file uploads to the public
 * market-listing-photos bucket under catalog-refs/, but only up to 6 per model
 * (best angles first) land in reference_image_urls.
 *
 * Rules:
 * - Filename slugs map to catalog models through an explicit table below —
 *   an unmapped slug stops the run so nothing lands on the wrong shoe.
 * - Verified rows are never touched (their refs are admin-confirmed).
 * - Unverified rows only FILL an empty reference_image_urls; existing refs stay.
 * - photo-sources.csv provenance is appended to source_notes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env. Run with: set -a && source .env.local && set +a');
  process.exit(1);
}
const admin = createClient(url, key);

const BUCKET = 'market-listing-photos';
const PREFIX = 'catalog-refs';
const MAX_REFS = 6;
const ANGLES = ['lateral', 'sole', 'top', 'heel', 'other'] as const;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** filename model-slug (brand prefix + model part, angle stripped) → catalog brand + model */
const MODEL_MAP: Record<string, { brand: string; model: string }> = {
  'adidas-adistar-john-smith': { brand: 'Adidas', model: 'Adistar (John Smith, 1990s)' },
  'adidas-adistar-wrestling': { brand: 'Adidas', model: 'Adistar Wrestling' },
  'adidas-adistrike': { brand: 'Adidas', model: 'Adistrike (John Smith)' },
  'adidas-adizero-london': { brand: 'Adidas', model: 'adizero London' },
  'adidas-adizero-wrestling-xiv': { brand: 'Adidas', model: 'adizero Wrestling XIV' },
  'adidas-combat-speed-og-1988': { brand: 'Adidas', model: 'Combat Speed OG (1988 West German)' },
  'adidas-combat-speed-og-teal': { brand: 'Adidas', model: 'Combat Speed OG (1998)' },
  'adidas-grappler': { brand: 'Adidas', model: 'Grappler (1998)' },
  'adidas-hercules': { brand: 'Adidas', model: 'Hercules (1978)' },
  'adidas-mat-wizard': { brand: 'Adidas', model: 'Mat Wizard (original John Smith line)' },
  'adidas-nitro': { brand: 'Adidas', model: 'Nitro (1995)' },
  'adidas-sydney-2000': { brand: 'Adidas', model: 'Sydney 2000' },
  'asics-cael-v1': { brand: 'Asics', model: 'Cael V1.0' },
  'asics-cael-v2': { brand: 'Asics', model: 'Cael V2.0' },
  'asics-cael-v3': { brand: 'Asics', model: 'Cael V3.0' },
  'asics-dan-gable-ultimate': { brand: 'Asics', model: 'Dan Gable Ultimate' },
  'asics-gable-ultraflex': { brand: 'Asics', model: 'Gable Ultraflex' },
  'asics-gel-assault': { brand: 'Asics', model: 'GEL-Assault' },
  'asics-les-gutches': { brand: 'Asics', model: 'Les Gutches' },
  'asics-rulon': { brand: 'Asics', model: 'Rulon' },
  'asics-the-baum': { brand: 'Asics', model: 'The Baum' },
  'asics-unrestrained': { brand: 'Asics', model: 'Unrestrained' },
  'brute-john-smith-signature': { brand: 'Brute', model: 'John Smith Signature' },
  'cliff-keen-converse-dominator': { brand: 'Cliff Keen', model: 'Converse Dominator' },
  'cronin-handcrafted-88-carolina-blue': { brand: 'Cronin', model: 'Handcrafted 88' },
  'nike-air-reversal': { brand: 'Nike', model: 'Air Reversal' },
  'nike-escape': { brand: 'Nike', model: 'Escape' },
  'nike-footsweep': { brand: 'Nike', model: 'Footsweep' },
  'nike-freek-cherry': { brand: 'Nike', model: 'Freek' },
  'nike-freek-panda': { brand: 'Nike', model: 'Freek' },
  'nike-greco': { brand: 'Nike', model: 'Greco' },
  'nike-inflict-2': { brand: 'Nike', model: 'Inflict 2' },
  'nike-inflict-oe': { brand: 'Nike', model: 'Inflict OE (Olympic Edition)' },
  'nike-inflict-og': { brand: 'Nike', model: 'Inflict (original)' },
  'nike-inflict-se-safari': { brand: 'Nike', model: "Inflict SE 'Safari Pack'" },
  'nike-kolat-2000': { brand: 'Nike', model: 'Kolat 2000' },
  'nike-kolat-2k4': { brand: 'Nike', model: 'Kolat 2K4' },
  'nike-kolat-international': { brand: 'Nike', model: 'Kolat International' },
  'nike-kolat-speed': { brand: 'Nike', model: 'Kolat Speed' },
  'nike-takedown': { brand: 'Nike', model: 'Takedown' },
  'nike-takedown-3': { brand: 'Nike', model: 'Takedown 3' },
  'nike-takedown-4-panda': { brand: 'Nike', model: 'Takedown 4' },
  'nike-takedown-5': { brand: 'Nike', model: 'Takedown 5' },
  'nike-takedown-supreme-2': { brand: 'Nike', model: 'Takedown Supreme 2' },
  'nike-ultra-combatant': { brand: 'Nike', model: 'Ultra Combatant' },
  'nike-wells': { brand: 'Nike', model: 'Wells' },
  'onitsuka-tiger-81': { brand: 'Onitsuka Tiger', model: 'Vintage Wrestling Boots (incl. Tiger 81)' },
  // Batch 2 (Priority 3)
  'adidas-adizero-mat-wizard-6': { brand: 'Adidas', model: 'adizero Mat Wizard 6' },
  'adidas-adizero-varner-2': { brand: 'Adidas', model: 'adizero Varner 2' },
  'adidas-adizero-wrestling-2024': { brand: 'Adidas', model: 'adizero Wrestling (2024)' },
  'adidas-combat-speed-4': { brand: 'Adidas', model: 'Combat Speed 4' },
  'adidas-combat-speed-4-david-taylor-m2': { brand: 'Adidas', model: 'Combat Speed 4' },
  'adidas-combat-speed-4-teal-yellow-pink': { brand: 'Adidas', model: 'Combat Speed 4' },
  'adidas-combat-speed-4-watermelon': { brand: 'Adidas', model: 'Combat Speed 4' },
  'adidas-combat-speed-5': { brand: 'Adidas', model: 'Combat Speed 5' },
  'adidas-hvc-2': { brand: 'Adidas', model: 'HVC 2' },
  'adidas-mat-hog-2': { brand: 'Adidas', model: 'Mat Hog 2.0' },
  'adidas-mat-wizard-5': { brand: 'Adidas', model: 'Mat Wizard 5' },
  'adidas-super-slay': { brand: 'Adidas', model: 'Super Slay' },
  'adidas-tech-fall-2': { brand: 'Adidas', model: 'Tech Fall 2.0' },
  'asics-aggressor-4': { brand: 'Asics', model: 'Aggressor 4' },
  'asics-aggressor-5': { brand: 'Asics', model: 'Aggressor 5' },
  'asics-aggressor-5-paris': { brand: 'Asics', model: 'Aggressor 5' },
  'asics-aggressor-6': { brand: 'Asics', model: 'Aggressor 6' },
  'asics-dan-gable-evo-3': { brand: 'Asics', model: 'Dan Gable EVO 3' },
  'asics-dave-schultz': { brand: 'Asics', model: 'Dave Schultz' },
  'asics-ex-eo': { brand: 'Asics', model: 'EX-EO' },
  'asics-matflex-3': { brand: 'Asics', model: 'Matflex 3' },
  'asics-matflex-7': { brand: 'Asics', model: 'Matflex 7' },
  'asics-reflex-iii': { brand: 'Asics', model: 'Reflex III' },
  'asics-snapdown-3': { brand: 'Asics', model: 'Snapdown 3' },
  'funky-flickr-boyz-gen-one': { brand: 'Nidrogen', model: 'GEN-ONE' },
  'funky-flickr-boyz-gen-one-midas': { brand: 'Nidrogen', model: 'GEN-ONE' },
  'nidrogen-aero': { brand: 'Nidrogen', model: 'AERO' },
  'nidrogen-pro-gen': { brand: 'Nidrogen', model: 'PRO-GEN' },
  'nidrogen-pro-gen-aurum': { brand: 'Nidrogen', model: 'PRO-GEN' },
  'nike-freek-2': { brand: 'Nike', model: 'Freek 2' },
  'nike-freek-reissue-rio': { brand: 'Nike', model: 'Freek (2016/2024 reissue)' },
  'nike-freek-volt': { brand: 'Nike', model: 'Freek' },
  'nike-fury': { brand: 'Nike', model: 'Fury' },
  'nike-greco-supreme': { brand: 'Nike', model: 'Greco Supreme' },
  'nike-inflict-3': { brand: 'Nike', model: 'Inflict 3' },
  'nike-inflict-3-rwb': { brand: 'Nike', model: 'Inflict 3' },
  'nike-inflict-4': { brand: 'Nike', model: 'Inflict 4' },
  'nike-tawa-se': { brand: 'Nike', model: 'TAWA SE' },
  'rudis-jb1': { brand: 'RUDIS', model: 'JB1' },
  'rudis-jb1-all-i-see-is-gold': { brand: 'RUDIS', model: 'JB1' },
  'rudis-ks-infinity-edge': { brand: 'RUDIS', model: 'KS Infinity Edge' },
  // Batch 3 (Priority 4)
  'adidas-adizero-varner': { brand: 'Adidas', model: 'adizero Varner' },
  'adidas-combat-speed-3': { brand: 'Adidas', model: 'Combat Speed 3' },
  'adidas-combat-speed-iv': { brand: 'Adidas', model: 'Combat Speed 4' },
  'adidas-combat-speed-vintage-red': { brand: 'Adidas', model: 'Combat Speed OG (1998)' },
  'adidas-flying-impact': { brand: 'Adidas', model: 'Flying Impact' },
  'adidas-hvc': { brand: 'Adidas', model: 'HVC' },
  'adidas-impact': { brand: 'Adidas', model: 'Impact' },
  'adidas-mat-hog': { brand: 'Adidas', model: 'Mat Hog' },
  'adidas-mat-wizard-4': { brand: 'Adidas', model: 'Mat Wizard 4' },
  'adidas-mat-wizard-hype': { brand: 'Adidas', model: 'Mat Wizard Hype' },
  'adidas-mat-wizard-iii': { brand: 'Adidas', model: 'Mat Wizard III' },
  'adidas-pretereo': { brand: 'Adidas', model: 'Pretereo' },
  'adidas-pretereo-iii': { brand: 'Adidas', model: 'Pretereo III' },
  'adidas-response-3-1': { brand: 'Adidas', model: 'Response 3.1' },
  'asics-aggressor': { brand: 'Asics', model: 'Aggressor' },
  'asics-aggressor-2': { brand: 'Asics', model: 'Aggressor 2' },
  'asics-aggressor-3': { brand: 'Asics', model: 'Aggressor 3' },
  'asics-aggressor-4-1081a046': { brand: 'Asics', model: 'Aggressor 4' },
  'asics-cael-v4': { brand: 'Asics', model: 'Cael V4.0' },
  'asics-cael-v5': { brand: 'Asics', model: 'Cael V5.0' },
  'asics-cael-v6': { brand: 'Asics', model: 'Cael V6.0' },
  'asics-cael-v7': { brand: 'Asics', model: 'Cael V7.0' },
  'asics-cael-v8': { brand: 'Asics', model: 'Cael V8.0' },
  'asics-dan-gable-classic': { brand: 'Asics', model: 'Dan Gable Classic' },
  'asics-dan-gable-evo': { brand: 'Asics', model: 'Dan Gable Evo' },
  'asics-dan-gable-evo-2': { brand: 'Asics', model: 'Dan Gable Evo 2' },
  'asics-ex-eo-reps': { brand: 'Asics', model: 'EXEO Reps' },
  'asics-jb-elite': { brand: 'Asics', model: 'JB Elite' },
  'asics-jb-elite-iii': { brand: 'Asics', model: 'JB Elite III' },
  'asics-jb-elite-iv': { brand: 'Asics', model: 'JB Elite IV' },
  'asics-jb-elite-v2': { brand: 'Asics', model: 'JB Elite V2.0' },
  'asics-matflex-6': { brand: 'Asics', model: 'Matflex 6' },
  'asics-omniflex-attack': { brand: 'Asics', model: 'Omniflex-Attack' },
  'asics-snapdown': { brand: 'Asics', model: 'Snapdown' },
  'asics-snapdown-2': { brand: 'Asics', model: 'Snapdown 2' },
  'asics-split-second': { brand: 'Asics', model: 'Split Second' },
  'asics-split-second-9': { brand: 'Asics', model: 'Split Second 9' },
  'asics-split-sol': { brand: 'Asics', model: 'Split Sole' },
  'cronin-vtg1': { brand: 'Cronin', model: 'Handcrafted 88' },
  'funky-flickr-boyz-postlude': { brand: 'Funky Flickr Boyz', model: 'Postlude' },
  'nidrogen-gen-one': { brand: 'Nidrogen', model: 'GEN-ONE' },
  'nike-hypersweep': { brand: 'Nike', model: 'Hypersweep' },
  'nike-hypersweep-rio': { brand: 'Nike', model: 'Hypersweep' },
  'nike-inflict-3-se-electric': { brand: 'Nike', model: 'Inflict OE (Olympic Edition)' },
  'nike-sidesweep': { brand: 'Nike', model: 'Sidesweep' },
  'nike-speedsweep-8': { brand: 'Nike', model: 'Speedsweep 8' },
  'nike-speedsweep-vii': { brand: 'Nike', model: 'Speedsweep VII' },
  'onev-introwaves': { brand: 'ONEV', model: 'Introwaves' },
  'onev-wrestling-shoe': { brand: 'ONEV', model: 'ONEV Wrestling Shoe' },
  'otomix-stingray': { brand: 'Otomix', model: 'Stingray Escape / Ninja Warrior (wrestling use)' },
  'rudis-kolat-legacy': { brand: 'RUDIS', model: 'Kolat Legacy' },
  'rudis-ks-turbine': { brand: 'RUDIS', model: 'KS Turbine' },
  'scraplife-ascend-one': { brand: 'ScrapLife', model: 'Ascend One' },
  'spartan-yianni': { brand: 'Spartan', model: 'YIANNI' },
};

type ParsedFile = { path: string; file: string; slug: string; angle: string; seq: number };

function parseFilename(path: string): ParsedFile | null {
  const file = basename(path);
  const m = file.match(new RegExp(`^(.+)-(${ANGLES.join('|')})(?:-(\\d+))?\\.jpe?g$`, 'i'));
  if (!m) return null;
  return { path, file, slug: m[1].toLowerCase(), angle: m[2].toLowerCase(), seq: m[3] ? parseInt(m[3], 10) : 1 };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jpe?g$/i.test(name)) out.push(p);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const [root, sourcesCsv] = args.filter((a) => a !== '--write');
  if (!root || !sourcesCsv) {
    console.error('Usage: tsx scripts/import-shoe-ref-photos.ts <photos-root> <photo-sources.csv> [--write]');
    process.exit(1);
  }

  const sources = new Map<string, string>();
  for (const line of readFileSync(sourcesCsv, 'utf8').split('\n').slice(1)) {
    const [file, srcUrl] = line.split(',');
    if (file?.trim() && srcUrl?.trim()) sources.set(file.trim(), srcUrl.trim());
  }

  const files = walk(root).map(parseFilename);
  const bad = walk(root).filter((p) => !parseFilename(p));
  if (bad.length) {
    console.error('Unparsable filenames (fix or remove):');
    bad.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }

  const unmapped = new Set(files.filter((f) => f && !MODEL_MAP[f.slug]).map((f) => f!.slug));
  if (unmapped.size) {
    console.error('Unmapped model slugs (add to MODEL_MAP):');
    unmapped.forEach((s) => console.error(`  ${s}`));
    process.exit(1);
  }

  const { data: catalog, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, model_aliases, verified, reference_image_urls, source_notes')
    .order('id');
  if (error) throw error;
  const index = new Map<string, (typeof catalog)[number]>();
  for (const r of catalog ?? []) {
    index.set(`${norm(r.brand)}|${norm(r.model)}`, r);
    for (const a of r.model_aliases ?? []) index.set(`${norm(r.brand)}|${norm(a)}`, r);
  }

  // Group files by catalog row.
  const byRow = new Map<string, { row: (typeof catalog)[number]; files: ParsedFile[] }>();
  for (const f of files as ParsedFile[]) {
    const target = MODEL_MAP[f.slug];
    const row = index.get(`${norm(target.brand)}|${norm(target.model)}`);
    if (!row) {
      console.error(`No catalog row for ${target.brand} ${target.model} (file ${f.file})`);
      process.exit(1);
    }
    const bucket = byRow.get(row.id) ?? { row, files: [] };
    bucket.files.push(f);
    byRow.set(row.id, bucket);
  }

  let uploaded = 0;
  let wired = 0;
  let skippedVerified = 0;
  let skippedHasRefs = 0;

  for (const { row, files: rowFiles } of byRow.values()) {
    // Angle priority, then colorway/sequence variety: first pass takes seq 1 of
    // each angle (across colorway slugs), later passes take the rest.
    const ordered = [...rowFiles].sort(
      (a, b) =>
        a.seq - b.seq ||
        ANGLES.indexOf(a.angle as (typeof ANGLES)[number]) - ANGLES.indexOf(b.angle as (typeof ANGLES)[number]) ||
        a.file.localeCompare(b.file)
    );
    const chosen = ordered.slice(0, MAX_REFS);

    // Upload every file (extras stay available in the bucket for later swaps).
    const publicUrls = new Map<string, string>();
    for (const f of rowFiles) {
      const storagePath = `${PREFIX}/${f.file}`;
      if (write) {
        const body = readFileSync(f.path);
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(storagePath, body, { contentType: 'image/jpeg', upsert: true });
        if (upErr) {
          console.error(`  UPLOAD FAILED ${f.file}: ${upErr.message}`);
          continue;
        }
      }
      uploaded += 1;
      publicUrls.set(f.file, admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl);
    }

    const label = `${row.brand} ${row.model}`;
    // A verified row keeps its admin-confirmed refs; one with NO refs has
    // nothing to protect and may take researched photos like any other row.
    if (row.verified && Array.isArray(row.reference_image_urls) && row.reference_image_urls.length) {
      skippedVerified += 1;
      console.log(`SKIP    ${label} [verified] — ${rowFiles.length} photos uploaded, refs untouched`);
      continue;
    }
    if (Array.isArray(row.reference_image_urls) && row.reference_image_urls.length) {
      skippedHasRefs += 1;
      console.log(`SKIP    ${label} — already has refs, ${rowFiles.length} photos uploaded only`);
      continue;
    }

    const refUrls = chosen.map((f) => publicUrls.get(f.file)).filter(Boolean) as string[];
    if (!refUrls.length) continue;
    wired += 1;
    console.log(`REFS    ${label}: ${refUrls.length} of ${rowFiles.length} photos → [${chosen.map((f) => f.angle + (f.seq > 1 ? `-${f.seq}` : '')).join(', ')}]`);
    if (write) {
      const note = `reference photos from web research 2026-11-16 (sources: ${[...new Set(chosen.map((f) => sources.get(f.file)).filter(Boolean))].slice(0, 3).join(', ')})`;
      const { error: upErr } = await admin
        .from('wrestling_shoes_catalog')
        .update({
          reference_image_urls: refUrls,
          source_notes: row.source_notes ? `${row.source_notes}; ${note}` : note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) console.error(`  FAILED: ${upErr.message}`);
    }
  }

  console.log(
    `\n${write ? 'APPLIED' : 'DRY RUN'}: ${uploaded} photos uploaded, ${wired} models wired with refs, ${skippedVerified} verified rows left alone, ${skippedHasRefs} rows already had refs`
  );
}

void main();
