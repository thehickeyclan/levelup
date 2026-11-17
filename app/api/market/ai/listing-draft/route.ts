import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';

/**
 * One call that drafts the whole listing: catalog match, condition grade,
 * price, and buyer-facing description. It orchestrates the existing AI
 * routes server-side (each stays canonical and keeps its own rate-limit
 * accounting) so the app makes one round trip instead of four.
 *
 * Sections degrade independently: a failed stage returns an error string in
 * its slot and the rest of the draft still comes back.
 */

type StageError = { error: string };

function forwardHeaders(req: NextRequest): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const name of ['authorization', 'cookie', 'x-tenant-slug', 'x-levelup-coach-id']) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

async function stage<T>(req: NextRequest, path: string, body: unknown): Promise<T | StageError> {
  try {
    const res = await fetch(`${req.nextUrl.origin}${path}`, {
      method: 'POST',
      headers: forwardHeaders(req),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: data.error || `${path} failed (${res.status})` };
    return data;
  } catch {
    return { error: `${path} unavailable` };
  }
}

const normColor = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    wear_state?: 'bnib' | 'new_no_box' | 'used';
    brand?: string;
    model?: string;
    colorway?: string;
    size?: number;
    condition?: string;
    listing_type?: string;
    description?: string;
    seller_note?: string;
    disclosure_tags?: string[];
  };
  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  if (!body.wear_state) return NextResponse.json({ error: 'wear_state required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, brand, model, colorway, size, condition')
    .eq('id', listingId)
    .single();
  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const brand = body.brand?.trim() || (listing.brand as string) || '';
  const model = body.model?.trim() || (listing.model as string) || '';
  const colorway = body.colorway?.trim() || (listing.colorway as string | null) || '';
  const size = body.size ?? (Number(listing.size) || 10);

  // Stage 1: catalog match (persists onto the listing) + condition from photos.
  const [catalog, condition] = await Promise.all([
    stage<{ found?: boolean; model_year?: number | null; colorway?: string | null }>(
      req,
      '/api/market/catalog/lookup',
      { listingId, brand, model, colorway: colorway || undefined, persist: true }
    ),
    stage<{
      analysis?: { grade?: string; wrestle_score?: number; cosmetic_score?: number; summary?: string; listing_tip?: string | null; breakdown?: unknown };
      suggested_description?: string;
      warning?: string;
    }>(req, '/api/market/ai/condition', {
      listingId,
      wear_state: body.wear_state,
      seller_note: body.seller_note?.trim() || undefined,
    }),
  ]);

  const grade =
    ('analysis' in (condition as object) && (condition as { analysis?: { grade?: string } }).analysis?.grade) ||
    body.condition ||
    (listing.condition as string) ||
    'good';

  // Stage 2: price and description in parallel — both want the grade from stage 1.
  const [price, agent] = await Promise.all([
    stage<{ price?: { suggested_mid_cents?: number; suggested_low_cents?: number; suggested_high_cents?: number; confidence?: string; confidence_note?: string } }>(
      req,
      '/api/market/ai/price',
      {
        listingId,
        brand,
        model,
        size,
        condition: grade,
        disclosure_tags: body.disclosure_tags,
        listing_type: body.listing_type || 'collection',
        description: body.description?.trim() || '',
        wear_state: body.wear_state,
        model_year: 'model_year' in (catalog as object) ? (catalog as { model_year?: number | null }).model_year ?? null : null,
        colorway: colorway || ('colorway' in (catalog as object) ? (catalog as { colorway?: string | null }).colorway ?? undefined : undefined),
      }
    ),
    stage<{ has_draft?: boolean; draft?: { description?: string; colorway?: string } }>(
      req,
      '/api/market/ai/agent',
      {
        draftId: listingId,
        include_cover_photo: true,
        messages: [
          {
            role: 'user',
            content: [
              'Write one buyer-facing wrestling shoe listing paragraph, 60–100 words.',
              'A photo of the actual pair is attached — describe the colorway and visible character from the photo, and never contradict it.',
              'Do not write filler like "see photos". Include model context, on-mat use, fit/lockdown, traction/sole, and colorway look.',
              'If exact history is uncertain, stay factual and restrained instead of inventing collector claims.',
              `Brand: ${brand}`,
              `Model: ${model}`,
              colorway ? `Colorway (seller-entered): ${colorway}` : 'Colorway: read it from the photo.',
              `Size: ${size}`,
              `Wear state: ${body.wear_state}`,
              `Condition: ${grade}`,
              body.seller_note?.trim() ? `Seller personal note: ${body.seller_note.trim()}` : null,
              'Return valid JSON with has_draft true and draft.description, plus draft.colorway as seen in the photo.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      }
    ),
  ]);

  // Colorway consistency: seller/form colorway vs what vision saw at identify
  // time and what the description pass reads from the photo now. Soft signal
  // only — the seller's word stands, but a mismatch is worth a look.
  let colorwayCheck: { consistent: boolean; note: string } | null = null;
  const { data: shoeId } = await admin
    .from('shoe_id_results')
    .select('identified_colorway')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const photoColorways = [
    shoeId?.identified_colorway as string | null,
    'draft' in (agent as object) ? (agent as { draft?: { colorway?: string } }).draft?.colorway ?? null : null,
  ].filter((c): c is string => Boolean(c?.trim()));
  if (colorway && photoColorways.length) {
    const seller = normColor(colorway);
    const sellerTokens = new Set(seller.split(' '));
    const consistent = photoColorways.some((photo) => {
      const p = normColor(photo);
      if (!p || !seller) return true;
      if (p.includes(seller) || seller.includes(p)) return true;
      return p.split(' ').some((token) => token.length > 2 && sellerTokens.has(token));
    });
    colorwayCheck = consistent
      ? { consistent: true, note: 'Colorway matches what AI sees in the photos.' }
      : {
          consistent: false,
          note: `You entered "${colorway}" but the photos read as "${photoColorways[0]}". Double-check before publishing — your word stands either way.`,
        };
  }

  return NextResponse.json({
    catalog,
    condition,
    price,
    description: agent,
    colorway_check: colorwayCheck,
  });
}
