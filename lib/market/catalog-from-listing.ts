import type { SupabaseClient } from '@supabase/supabase-js';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import { normalizeMarketBrand } from '@/lib/market/brands';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import {
  legacyColorwaysToProfiles,
  normalizeColorwayName,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';

/** High-confidence vision + catalog match → skip manual identity confirm. */
export const AUTO_CONFIRM_CATALOG_CONFIDENCE = 0.8;

export function shouldAutoConfirmIdentity(input: {
  catalogMatchId: string | null;
  result: ShoeIdResult;
}): boolean {
  return Boolean(
    input.catalogMatchId &&
      input.result.catalog_matched &&
      input.result.confidence >= AUTO_CONFIRM_CATALOG_CONFIDENCE
  );
}

const MAX_REFERENCE_IMAGES = 6;

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url.startsWith('http') || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.slice(0, MAX_REFERENCE_IMAGES);
}

function mergeReferenceImages(existing: string[] | null | undefined, incoming: string[]): string[] {
  return dedupeUrls([...(existing ?? []), ...incoming]);
}

function mergeColorwayProfiles(
  existingRaw: unknown,
  colorway: string | null | undefined
): unknown[] | undefined {
  const name = colorway?.trim();
  if (!name) return undefined;

  const profiles = parseColorwayProfiles(existingRaw);
  const legacy = legacyColorwaysToProfiles(
    Array.isArray(existingRaw) ? (existingRaw as unknown[]) : null
  );
  const merged = profiles.length ? profiles : legacy;
  const exists = merged.some((p) => normalizeColorwayName(p.name) === normalizeColorwayName(name));
  if (exists) return undefined;

  return [...merged, { name, availability: 'unknown' }];
}

function catalogSourceForListingType(listingType: string): string {
  return listingType === 'collection' ? 'showcase' : 'community';
}

async function linkLatestShoeIdResult(
  admin: SupabaseClient,
  listingId: string,
  catalogId: string
): Promise<void> {
  const { data: latest } = await admin
    .from('shoe_id_results')
    .select('id')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.id) return;

  await admin
    .from('shoe_id_results')
    .update({ catalog_match_id: catalogId })
    .eq('id', latest.id);
}

type ListingFeedRow = {
  id: string;
  brand: string;
  model: string;
  colorway: string | null;
  listing_type: string;
  rarity: string | null;
  weight_class: string | null;
  model_year: number | null;
  description: string | null;
};

/**
 * Every published listing feeds the shoe catalog:
 * - Known model → merge reference photos, colorways, and empty metadata (community validation)
 * - New model → unverified catalog stub from seller photos + fields (community discovery)
 */
export async function feedListingToCatalog(
  admin: SupabaseClient,
  listingId: string
): Promise<{ action: 'merged' | 'created' | 'skipped'; catalogId?: string }> {
  const { data: listing, error: listingErr } = await admin
    .from('market_listings')
    .select(
      'id, brand, model, colorway, listing_type, rarity, weight_class, model_year, description'
    )
    .eq('id', listingId)
    .maybeSingle();

  if (listingErr || !listing) {
    return { action: 'skipped' };
  }

  const row = listing as ListingFeedRow;
  const brand = row.brand?.trim();
  const model = row.model?.trim();
  if (!brand || model.length < 2) return { action: 'skipped' };

  const { data: images } = await admin
    .from('market_listing_images')
    .select('public_url')
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .limit(MAX_REFERENCE_IMAGES);

  const imageUrls = dedupeUrls(
    (images ?? [])
      .map((img) => (typeof img.public_url === 'string' ? img.public_url : ''))
      .filter(Boolean)
  );
  if (!imageUrls.length) return { action: 'skipped' };

  const existing = (await findCatalogEntry(admin, brand, model)) as
    | (Record<string, unknown> & { id: string; verified?: boolean })
    | null;

  if (existing?.id) {
    const patch: Record<string, unknown> = {
      reference_image_urls: mergeReferenceImages(
        existing.reference_image_urls as string[] | null,
        imageUrls
      ),
      updated_at: new Date().toISOString(),
    };

    const colorwayProfiles = mergeColorwayProfiles(existing.colorway_profiles, row.colorway);
    if (colorwayProfiles) patch.colorway_profiles = colorwayProfiles;

    if (!existing.weight && row.weight_class?.trim()) {
      patch.weight = row.weight_class.trim();
    }

    if (!existing.years_produced && row.model_year) {
      patch.years_produced = String(row.model_year);
    }

    const listingRarity = normalizeMarketRarity(row.rarity);
    if (listingRarity && (!existing.rarity || !existing.verified)) {
      patch.rarity = listingRarity;
    }

    if (!existing.collector_notes && row.description?.trim()) {
      patch.collector_notes = row.description.trim().slice(0, 500);
    }

    const { error } = await admin
      .from('wrestling_shoes_catalog')
      .update(patch)
      .eq('id', existing.id);

    if (error) {
      console.error('feedListingToCatalog merge:', error.message);
      return { action: 'skipped' };
    }

    await linkLatestShoeIdResult(admin, listingId, existing.id);
    return { action: 'merged', catalogId: existing.id };
  }

  const rarity =
    normalizeMarketRarity(row.rarity) ??
    ('uncommon' as MarketRarity);

  const notes = row.description?.trim().slice(0, 500) || null;

  const { data: created, error: createErr } = await admin
    .from('wrestling_shoes_catalog')
    .insert({
      brand: normalizeMarketBrand(brand),
      model: model.trim(),
      rarity,
      reference_image_urls: imageUrls,
      weight: row.weight_class?.trim() || null,
      years_produced: row.model_year ? String(row.model_year) : null,
      collector_notes: notes,
      colorway_profiles: row.colorway?.trim()
        ? [{ name: row.colorway.trim(), availability: 'unknown' }]
        : [],
      source: catalogSourceForListingType(row.listing_type),
      verified: false,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createErr || !created) {
    console.error('feedListingToCatalog create:', createErr?.message);
    return { action: 'skipped' };
  }

  const catalogId = created.id as string;
  await linkLatestShoeIdResult(admin, listingId, catalogId);
  return { action: 'created', catalogId };
}
