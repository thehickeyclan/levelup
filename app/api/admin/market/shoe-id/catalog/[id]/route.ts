import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { CatalogEntrySchema } from '@/lib/market/shoe-id/schemas';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = CatalogEntrySchema.partial().safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.')}: ${issue.message}` : 'validation failed';
    return NextResponse.json({ error: `Invalid catalog entry — ${detail}` }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const { error } = await admin
    .from('wrestling_shoes_catalog')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    const msg = error.message;
    const hint =
      /reference_image_urls|sale_comps|original_msrp|catalog_price|inflation_adjusted|column/i.test(msg)
        ? `${msg} — apply wrestling_shoes_catalog migrations on Supabase`
        : msg;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient(auth.tenantSlug);
  const { error } = await admin.from('wrestling_shoes_catalog').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
