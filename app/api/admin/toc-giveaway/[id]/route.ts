import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { grantCredit } from '@/lib/credits';
import {
  TOC_GIVEAWAY_CAMPAIGN,
  TOC_GIVEAWAY_CREDIT_AMOUNT,
} from '@/lib/toc-giveaway';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const winner = body?.winner === true;

  const admin = createAdminClient(auth.tenantSlug);
  const { data, error } = await admin
    .from('toc_giveaway_entries')
    .update({
      winner,
      selected_at: winner ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Giveaway entry not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const admin = createAdminClient(auth.tenantSlug);

  const { data: entry, error } = await admin
    .from('toc_giveaway_entries')
    .select('id, campaign, user_id, first_name, last_name, winner, credit_granted, credit_id')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entry) return NextResponse.json({ error: 'Giveaway entry not found' }, { status: 404 });

  const row = entry as {
    id: string;
    campaign: string;
    user_id: string;
    first_name?: string | null;
    last_name?: string | null;
    winner?: boolean | null;
    credit_granted?: boolean | null;
    credit_id?: string | null;
  };

  if (row.campaign !== TOC_GIVEAWAY_CAMPAIGN) {
    return NextResponse.json({ error: 'Unsupported giveaway campaign' }, { status: 400 });
  }
  if (!row.winner) {
    return NextResponse.json({ error: 'Mark this wrestler as a winner before granting credit' }, { status: 400 });
  }
  if (row.credit_granted && row.credit_id) {
    return NextResponse.json({ ok: true, creditId: row.credit_id, alreadyGranted: true });
  }

  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'TOC winner';
  const result = await grantCredit({
    userId: row.user_id,
    amount: TOC_GIVEAWAY_CREDIT_AMOUNT,
    reason: `Tournament of Champions $100 training-credit winner — ${name} — entry ${row.id}`,
    sourceType: 'promo',
    tenantSlug: auth.tenantSlug,
  });

  if (!result.success || !result.creditId) {
    return NextResponse.json({ error: result.error || 'Failed to grant credit' }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from('toc_giveaway_entries')
    .update({
      credit_granted: true,
      credit_id: result.creditId,
      credited_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, creditId: result.creditId });
}
