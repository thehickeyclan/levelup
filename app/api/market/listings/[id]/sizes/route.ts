import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import {
  fetchListingSizes,
  normalizeSizeInputs,
  replaceListingSizes,
  supportsMultiSizeInventory,
  syncListingPrimarySize,
  type ListingSizeInput,
} from '@/lib/market/listing-sizes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase } = ctx;
  const { id } = await params;

  const sizes = await fetchListingSizes(supabase, id);
  return NextResponse.json({ sizes });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: listing, error: loadErr } = await supabase
    .from('market_listings')
    .select('seller_id, wear_state, status')
    .eq('id', id)
    .single();

  if (loadErr || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }
  if (listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sizes?: { size_us: number | string; quantity: number | string }[];
  };

  const wearState = listing.wear_state as string | null;
  if (!supportsMultiSizeInventory(wearState)) {
    return NextResponse.json(
      { error: 'Multi-size inventory is only for BNIB and new (no box) listings.' },
      { status: 400 }
    );
  }

  const inputs: ListingSizeInput[] = (body.sizes ?? []).map((row) => ({
    size_us: Number(row.size_us),
    quantity: Number(row.quantity),
  }));

  const normalized = normalizeSizeInputs(inputs);
  if (!normalized.length) {
    return NextResponse.json({ error: 'Add at least one size with quantity.' }, { status: 400 });
  }

  const { sizes, error } = await replaceListingSizes(supabase, id, normalized);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  await syncListingPrimarySize(supabase, id, sizes);

  return NextResponse.json({ sizes });
}
