import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import {
  classifyListingFiling,
  comparePhotoIdentification,
} from '@/lib/market/filing-check';
import {
  findCatalogEntry,
  findCatalogEntryWithAliases,
  fetchCatalogEntries,
  getCatalogContext,
} from '@/lib/market/shoe-id/catalog';
import { buildShoeIdVisionContent } from '@/lib/market/shoe-id/images';
import { listingQueryImageBlocks } from '@/lib/market/shoe-id/load-query-images';
import { SHOE_ID_SYSTEM_PROMPT, shoeIdUserMessage } from '@/lib/market/shoe-id/prompts';
import { ShoeIdResultSchema } from '@/lib/market/shoe-id/schemas';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';

export const maxDuration = 120;

/** Every live listing with its deterministic filing classification. */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const admin = createAdminClient(auth.tenantSlug);

  const [{ data: listings }, { data: catalog }] = await Promise.all([
    admin
      .from('market_listings')
      .select('id, title, brand, model, colorway, listing_type, status, price_cents')
      .eq('status', 'active')
      .order('id')
      .limit(500),
    admin
      .from('wrestling_shoes_catalog')
      .select('brand, model, model_aliases')
      .order('id')
      .limit(2000),
  ]);

  const catalogRows = (catalog ?? []) as {
    brand: string;
    model: string;
    model_aliases?: string[] | null;
  }[];

  const rows = (listings ?? []).map((l) => ({
    id: l.id as string,
    title: (l.title as string | null) ?? '',
    brand: (l.brand as string | null) ?? '',
    model: (l.model as string | null) ?? '',
    colorway: (l.colorway as string | null) ?? null,
    listing_type: l.listing_type as string,
    price_cents: (l.price_cents as number | null) ?? null,
    classification: classifyListingFiling(
      l.brand as string | null,
      l.model as string | null,
      catalogRows
    ),
  }));

  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const admin = createAdminClient(auth.tenantSlug);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    listingId?: string;
    brand?: string;
    model?: string;
  };
  const listingId = body.listingId?.trim();
  if (!listingId) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  const { data: listing } = await admin
    .from('market_listings')
    .select('id, brand, model, title, status')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (body.action === 'refile') {
    const brand = body.brand?.trim();
    const model = body.model?.trim();
    if (!brand || !model) {
      return NextResponse.json({ error: 'brand and model required' }, { status: 400 });
    }
    // Refile only onto a real catalog row — this endpoint exists to END
    // non-catalog names, not mint new ones.
    const target = await findCatalogEntry(admin, brand, model);
    if (!target) {
      return NextResponse.json(
        { error: `No catalog row for ${brand} ${model}` },
        { status: 400 }
      );
    }
    const previous = { brand: listing.brand as string, model: listing.model as string };
    const { error: updateErr } = await admin
      .from('market_listings')
      .update({ brand: target.brand as string, model: target.model as string })
      .eq('id', listingId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      previous,
      current: { brand: target.brand, model: target.model },
    });
  }

  if (body.action === 'photo-check') {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return NextResponse.json({ error: 'AI is not configured' }, { status: 503 });
    }
    const { data: images } = await admin
      .from('market_listing_images')
      .select('storage_path, public_url')
      .eq('listing_id', listingId)
      .order('display_order', { ascending: true })
      .limit(6);
    if (!images?.length) {
      return NextResponse.json({ error: 'Listing has no photos' }, { status: 400 });
    }

    const [catalogContext, catalogEntries, queryBlocks] = await Promise.all([
      getCatalogContext(admin),
      fetchCatalogEntries(admin),
      listingQueryImageBlocks(admin, images),
    ]);

    const { blocks, queryImageCount, referenceImageCount } = buildShoeIdVisionContent(
      [],
      catalogEntries,
      { queryBlocks }
    );
    if (!queryImageCount) {
      return NextResponse.json({ error: 'Could not load photos' }, { status: 400 });
    }

    // No brand/model hint on purpose: the check is only honest if the photos
    // speak before the filing does (§1.6).
    const claude = await callClaude(
      SHOE_ID_SYSTEM_PROMPT(catalogContext),
      [...blocks, { type: 'text', text: shoeIdUserMessage(queryImageCount, referenceImageCount) }],
      2048
    );
    let parsed = null;
    if (claude.ok) {
      try {
        parsed = ShoeIdResultSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
      } catch (e) {
        console.error('filing photo-check parse:', e);
      }
    }
    if (!parsed) {
      return NextResponse.json({ error: 'Photo identification failed — try again' }, { status: 503 });
    }

    const [filedRow, photoRow] = await Promise.all([
      listing.brand && listing.model
        ? findCatalogEntry(admin, listing.brand as string, listing.model as string)
        : Promise.resolve(null),
      findCatalogEntryWithAliases(admin, parsed.brand, parsed.model, parsed.model_aliases),
    ]);

    const comparison = comparePhotoIdentification({
      filed: { brand: (listing.brand as string) ?? '', model: (listing.model as string) ?? '' },
      filedCatalogId: (filedRow?.id as string | undefined) ?? null,
      photo: { brand: parsed.brand, model: parsed.model, confidence: parsed.confidence },
      photoCatalogId: (photoRow?.id as string | undefined) ?? null,
    });

    const tokens = claude.ok ? claude.result : { tokensIn: 0, tokensOut: 0 };
    void admin.from('market_ai_logs').insert({
      user_id: auth.userId,
      listing_id: listingId,
      route: 'filing-check',
      model_used: ANTHROPIC_MODEL,
      tokens_in: tokens.tokensIn ?? 0,
      tokens_out: tokens.tokensOut ?? 0,
      cost_estimate_cents: 2,
    });

    return NextResponse.json({
      verdict: comparison.verdict,
      note: comparison.note,
      photo: {
        brand: photoRow ? (photoRow.brand as string) : parsed.brand,
        model: photoRow ? (photoRow.model as string) : parsed.model,
        colorway: parsed.colorway,
        confidence: parsed.confidence,
        inCatalog: photoRow != null,
      },
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
