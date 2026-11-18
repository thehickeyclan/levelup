/**
 * Apply the 2026-11-18 pricing-audit data fixes (Muse audit, Matt's ground truth).
 *
 *   npx tsx scripts/apply-pricing-audit-2026-11-18.ts          # dry run
 *   npx tsx scripts/apply-pricing-audit-2026-11-18.ts --write  # apply
 *
 * 1. CS4 "Orange / Black / White" profile → rare tier, $400 Committed purchase
 *    as single-sale evidence in notes (no invented median).
 * 2. Split Second: "OG Red (1997)" variant profile, curated from the IG sold
 *    pool (78 priced sales, median $176) — the OG market trades on IG, the
 *    eBay pool is V/VI/7 reissues. Matt's listing refiles to that colorway.
 * 3. Nike Takedown listing (Matt's Navy/White/Total Orange BNIB) → Cronin
 *    Takedown re-make, per the standing Cronin rule; curated band $500–$750
 *    on a matching profile ($615 documented sale sits inside it).
 * 4. EX-EO originals: grail variant profiles for Matt's two Russian-era pairs
 *    with owner-purchase evidence in notes, no curated value — the engine
 *    shows evidence instead of the reissue pool's $254. Listings refile to
 *    the variant colorway names.
 */
import { createAdminClient } from '../lib/supabase/admin';

const WRITE = process.argv.includes('--write');
const admin = createAdminClient('guild');

type Profile = Record<string, unknown> & { name?: string };

function upsertProfile(profiles: Profile[], next: Profile): Profile[] {
  const key = String(next.name ?? '').trim().toLowerCase();
  const idx = profiles.findIndex((p) => String(p.name ?? '').trim().toLowerCase() === key);
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...next };
    return profiles;
  }
  return [...profiles, next];
}

async function patchCatalog(
  idPrefix: string,
  describe: string,
  mutate: (row: Record<string, unknown>) => Record<string, unknown>
) {
  const { data } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, colorway_profiles, collector_notes')
    .order('id')
    .limit(2000);
  const row = (data ?? []).find((r) => (r.id as string).startsWith(idPrefix));
  if (!row) throw new Error(`catalog row ${idPrefix} not found`);
  const patch = mutate(row as Record<string, unknown>);
  console.log(`${WRITE ? 'WRITE' : 'DRY'} catalog ${row.brand} ${row.model}: ${describe}`);
  if (WRITE) {
    const { error } = await admin
      .from('wrestling_shoes_catalog')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', row.id as string);
    if (error) throw error;
  }
}

async function patchListing(idPrefix: string, describe: string, patch: Record<string, unknown>) {
  const { data } = await admin
    .from('market_listings')
    .select('id, title, brand, model, colorway')
    .eq('status', 'active')
    .order('id')
    .limit(400);
  const row = (data ?? []).find((r) => (r.id as string).startsWith(idPrefix));
  if (!row) throw new Error(`listing ${idPrefix} not found`);
  console.log(
    `${WRITE ? 'WRITE' : 'DRY'} listing ${row.title} (${(row.id as string).slice(0, 8)}): ${describe}`
  );
  if (WRITE) {
    const { error } = await admin.from('market_listings').update(patch).eq('id', row.id as string);
    if (error) throw error;
  }
}

async function main() {
  // 1. CS4 Orange / Black / White → rare tier + Committed purchase evidence.
  await patchCatalog('b5ff681a', 'Orange/Black/White → rare tier, $400 Committed evidence', (row) => {
    const profiles = (row.colorway_profiles as Profile[]) ?? [];
    return {
      colorway_profiles: upsertProfile(profiles, {
        name: 'Orange / Black / White',
        availability: 'discontinued',
        value_tier: 'rare',
        notes:
          'Rare-tier colorway on an inverted model — documented purchase $400 BNIB on Committed (2026). Single-sale evidence; sits at or above the used-pool reference.',
      }),
    };
  });

  // 2. Split Second OG generation.
  await patchCatalog('ed74ee3d', 'add "OG Red (1997)" variant profile from the IG sold pool', (row) => {
    const profiles = (row.colorway_profiles as Profile[]) ?? [];
    return {
      colorway_profiles: upsertProfile(profiles, {
        name: 'OG Red (1997)',
        availability: 'grail',
        value_tier: 'rare',
        value_mid_cents: 17600,
        notes:
          'OG generation — priced from the IG sold pool (78 priced sales, median $176, price-index v2). The eBay pool is V/VI/7 reissues at $13–$60 and never prices the OG. New OG pairs trade at a premium over the median.',
      }),
    };
  });
  await patchListing('6e17bca4', 'colorway Red → OG Red (1997)', { colorway: 'OG Red (1997)' });

  // 3. Cronin Takedown re-make: refile the listing, curate the band.
  await patchCatalog('21451645', 'curated band $500–$750 for Navy/White/Total Orange re-make', (row) => {
    const profiles = (row.colorway_profiles as Profile[]) ?? [];
    return {
      colorway_profiles: upsertProfile(profiles, {
        name: 'Navy / White / Total Orange',
        availability: 'limited',
        value_tier: 'rare',
        value_low_cents: 50000,
        value_high_cents: 75000,
        notes:
          "Cronin Bespoke re-make of the Nike Takedown — the line trades $500–$750 (owner-documented; Matt's eBay reference for this pair $750). The $615 documented sale sits inside the band.",
      }),
    };
  });
  await patchListing('b7490954', 'refile Nike Takedown → Cronin Takedown (re-make)', {
    brand: 'Cronin',
    model: 'Takedown',
  });

  // 4. EX-EO Russian-era originals: evidence identities, never the reissue pool.
  await patchCatalog('c89e906a', 'add grail variant profiles for the two originals', (row) => {
    let profiles = (row.colorway_profiles as Profile[]) ?? [];
    profiles = upsertProfile(profiles, {
      name: 'Russian Original — Royal Blue / Red / White',
      availability: 'grail',
      value_tier: 'grail',
      notes:
        'Original Russian-era EX-EO — documented purchase $500+ (owner, 2026). The eBay/IG pools price the TWR900 Successor reissue ($219–$277) and never this variant.',
    });
    profiles = upsertProfile(profiles, {
      name: 'Original — Red / Gold / White',
      availability: 'grail',
      value_tier: 'grail',
      notes:
        'Original EX-EO, brand new with tags — documented purchase $750 (owner, 2026). The eBay/IG pools price the TWR900 Successor reissue and never this variant.',
    });
    return { colorway_profiles: profiles };
  });
  await patchListing('74ae171f', 'colorway → Russian Original — Royal Blue / Red / White', {
    colorway: 'Russian Original — Royal Blue / Red / White',
  });
  await patchListing('a7fbaa25', 'colorway → Original — Red / Gold / White', {
    colorway: 'Original — Red / Gold / White',
  });

  console.log(WRITE ? 'Applied.' : 'Dry run complete — re-run with --write to apply.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
