/**
 * Full Guild Market loop smoke test against a live backend. Run before calling
 * ANY market change done (app or web):
 *
 *   npx tsx scripts/market-loop-smoke.ts https://www.wrestlingguild.com [--with-clean]
 *
 * Covers: create draft → edit/save (the exact app payloads) → photo upload →
 * [optional background clean, costs 1 remove.bg credit] → AI identify /
 * condition / value / description → publish → public share page unfurl →
 * buyer offer → seller accept → order created with seller payout fields →
 * offer thread exists → full cleanup (synthetic buyer account + all rows).
 *
 * Seller = platform admin account. Buyer = dedicated synthetic test account
 * (market-smoke-buyer@wrestlingguild.com), created on first run.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnvLocal();

const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL || process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL || '';
const service =
  process.env.GUILD_SUPABASE_SERVICE_KEY || process.env.NC_UNITED_SUPABASE_SERVICE_KEY || '';
const anon =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_ANON_KEY ||
  '';
const API = process.argv[2] || 'https://www.wrestlingguild.com';
const WITH_CLEAN = process.argv.includes('--with-clean');
const SELLER_EMAIL = process.env.MARKET_SMOKE_EMAIL || 'thehickeyclan@gmail.com';
const BUYER_EMAIL = 'market-smoke-buyer@wrestlingguild.com';
// Any stable public shoe photo in your storage works; falls back to newest listing image.
let failures = 0;

function report(step: string, ok: boolean, detail: string) {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.padEnd(22)} ${detail}`);
}

function skip(step: string, detail: string) {
  console.log(`skip  ${step.padEnd(22)} ${detail}`);
}

async function mintSession(admin: SupabaseClient, email: string): Promise<string> {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const client = createClient(url, anon);
  const { data, error: verifyErr } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties!.hashed_token,
  });
  if (verifyErr) throw verifyErr;
  return data.session!.access_token;
}

function authed(jwt: string) {
  return async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'x-tenant-slug': 'guild',
        'Content-Type': 'application/json',
      },
      ...init,
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-json */
    }
    return { status: res.status, body };
  };
}

async function ensureBuyer(admin: SupabaseClient): Promise<string> {
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', BUYER_EMAIL)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await admin.auth.admin.createUser({
    email: BUYER_EMAIL,
    email_confirm: true,
  });
  if (error || !created.user) throw error ?? new Error('buyer create failed');
  await admin.from('users').upsert({
    id: created.user.id,
    email: BUYER_EMAIL,
    first_name: 'Market',
    last_name: 'SmokeBuyer',
    role: 'parent',
  });
  return created.user.id;
}

async function main() {
  const admin = createClient(url, service);
  const sellerJwt = await mintSession(admin, SELLER_EMAIL);
  const seller = authed(sellerJwt);
  const buyerId = await ensureBuyer(admin);
  const buyerJwt = await mintSession(admin, BUYER_EMAIL);
  const buyer = authed(buyerJwt);

  const cleanup: (() => Promise<void>)[] = [];
  let listingId = '';

  try {
    // 1. Create draft
    const created = await seller('/api/market/listings', {
      method: 'POST',
      body: JSON.stringify({
        draft: true,
        title: 'SMOKE LOOP — delete me',
        listing_type: 'collection',
        wear_state: 'used',
        condition: 'good',
        size: 10,
      }),
    });
    listingId = (created.body.listingId as string) || '';
    report('create-draft', created.status === 200 && Boolean(listingId), `status ${created.status}`);
    if (!listingId) throw new Error('no listing id');
    cleanup.push(async () => {
      await admin.from('market_listing_images').delete().eq('listing_id', listingId);
      await admin.from('market_listings').delete().eq('id', listingId);
    });

    // 2. Edit/save — the exact app payloads that broke on the condition constraint
    const saveBnib = await seller(`/api/market/listings/${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'ASICS SmokeLoop',
        brand: 'ASICS',
        model: 'SmokeLoop',
        colorway: null,
        size: 9,
        wear_state: 'bnib',
        condition: 'new',
        description: 'Smoke loop test pair.',
        listing_type: 'collection',
        price_cents: null,
        accepts_offers: true,
      }),
    });
    const saveUsed = await seller(`/api/market/listings/${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ wear_state: 'used', condition: 'like_new' }),
    });
    const { data: afterSave } = await admin
      .from('market_listings')
      .select('model, size, condition, description')
      .eq('id', listingId)
      .maybeSingle();
    report(
      'edit-save',
      saveBnib.status === 200 &&
        saveUsed.status === 200 &&
        afterSave?.model === 'SmokeLoop' &&
        afterSave?.condition === 'like_new' &&
        Boolean(afterSave?.description),
      `bnib ${saveBnib.status} · used ${saveUsed.status} · persisted ${JSON.stringify(afterSave)}`
    );

    // 3. Photo upload (reuse newest stored market photo as bytes)
    const { data: anyImage } = await admin
      .from('market_listing_images')
      .select('public_url')
      .not('public_url', 'is', null)
      .neq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let imageId = '';
    if (anyImage?.public_url) {
      const imgRes = await fetch(anyImage.public_url as string);
      const ok = imgRes.ok && (imgRes.headers.get('content-type') || '').startsWith('image/');
      if (ok) {
        const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        const upload = await seller(`/api/market/listings/${listingId}/images`, {
          method: 'POST',
          body: JSON.stringify({ fileName: 'smoke.jpg', mimeType: 'image/jpeg', base64 }),
        });
        imageId = ((upload.body.image as Record<string, unknown>)?.id as string) || '';
        report('photo-upload', upload.status === 200 && Boolean(imageId), `status ${upload.status}`);
      } else {
        report('photo-upload', false, 'source image bytes were not a valid image');
      }
    } else {
      report('photo-upload', false, 'no existing market photo found to reuse');
    }

    // 4. Background clean (optional — spends 1 remove.bg credit)
    if (WITH_CLEAN && imageId) {
      const clean = await seller(`/api/market/listings/${listingId}/images/${imageId}/clean`, {
        method: 'POST',
        body: '{}',
      });
      report(
        'background-clean',
        clean.status === 200 && clean.body.success === true,
        `status ${clean.status} ${JSON.stringify(clean.body).slice(0, 100)}`
      );
    } else {
      skip('background-clean', WITH_CLEAN ? 'no image' : 'run with --with-clean (1 credit)');
    }

    // 5. AI condition + value + description
    const condition = await seller('/api/market/ai/condition', {
      method: 'POST',
      body: JSON.stringify({ listingId, wear_state: 'used' }),
    });
    const grade = (condition.body.analysis as { grade?: string } | undefined)?.grade;
    report('ai-condition', condition.status === 200 && Boolean(grade), `status ${condition.status} → ${grade}`);

    const price = await seller('/api/market/ai/price', {
      method: 'POST',
      body: JSON.stringify({
        listingId,
        brand: 'ASICS',
        model: 'SmokeLoop',
        size: 9,
        condition: grade || 'good',
        listing_type: 'sell',
        wear_state: 'used',
      }),
    });
    const mid = (price.body.price as { suggested_mid_cents?: number } | undefined)?.suggested_mid_cents;
    report('ai-value', price.status === 200 && typeof mid === 'number' && mid > 0, `status ${price.status} → $${mid ? Math.round(mid / 100) : '?'}`);

    const agent = await seller('/api/market/ai/agent', {
      method: 'POST',
      body: JSON.stringify({
        draftId: listingId,
        messages: [
          { role: 'user', content: 'Write one 60-word buyer-facing paragraph for a used ASICS wrestling shoe. Return valid JSON with has_draft true and draft.description.' },
        ],
      }),
    });
    const desc = (agent.body.draft as { description?: string } | undefined)?.description;
    report('ai-description', agent.status === 200 && Boolean(desc && desc.length > 40), `status ${agent.status}`);

    // 6. Publish for sale
    const publish = await seller(`/api/market/listings/${listingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ listing_type: 'sell', price_cents: 6000, status: 'active', accepts_offers: true }),
    });
    report('publish', publish.status === 200, `status ${publish.status}`);

    // 7. Public share page unfurls with cover (anonymous, like iMessage's crawler)
    const shareRes = await fetch(`${API}/share/listing/${listingId}`);
    const shareHtml = await shareRes.text();
    const hasOg = shareHtml.includes('og:title');
    const hasImage = shareHtml.includes('og:image');
    report(
      'share-unfurl',
      shareRes.status === 200 && hasOg && (imageId ? hasImage : true),
      `status ${shareRes.status} · og:title ${hasOg} · og:image ${hasImage}`
    );

    // 8. Buyer makes a cash offer
    const offer = await buyer('/api/market/offers', {
      method: 'POST',
      body: JSON.stringify({ listingId, offerType: 'cash', amountCents: 4500, message: 'smoke offer' }),
    });
    const offerId = (offer.body.offerId as string) || ((offer.body.offer as Record<string, unknown>)?.id as string) || '';
    report('buyer-offer', (offer.status === 200 || offer.status === 201) && Boolean(offerId), `status ${offer.status} ${offerId ? '' : JSON.stringify(offer.body).slice(0, 100)}`);
    if (offerId) {
      cleanup.push(async () => {
        await admin.from('market_offers').delete().eq('id', offerId);
      });
    }

    // 9. Seller accepts → order created, seller sees payout fields
    if (offerId) {
      const accept = await seller(`/api/market/offers/${offerId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept' }),
      });
      const orderId = (accept.body.orderId as string) || (accept.body.acceptedOrderId as string) || '';
      report('seller-accept', accept.status === 200, `status ${accept.status}`);

      const { data: orderRow } = await admin
        .from('market_orders')
        .select('id, status, seller_payout_cents')
        .eq('listing_id', listingId)
        .maybeSingle();
      if (orderRow?.id) {
        cleanup.push(async () => {
          await admin.from('market_orders').delete().eq('id', orderRow.id);
          await admin.from('market_listings').update({ locked_buyer_id: null, status: 'archived' }).eq('id', listingId);
        });
        const orderView = await seller(`/api/market/orders/${orderRow.id}`);
        const o = (orderView.body.order as Record<string, unknown>) || {};
        report(
          'order-payout-fields',
          orderView.status === 200 && typeof o.payout_cents === 'number' && typeof o.payout_status === 'string',
          `status ${orderView.status} → payout $${typeof o.payout_cents === 'number' ? (o.payout_cents / 100).toFixed(2) : '?'} (${o.payout_status})`
        );
      } else {
        report('order-payout-fields', false, `no order row created (accept said ${accept.status})${orderId ? '' : ''}`);
      }

      // 10. Offer message thread exists
      const { data: thread } = await admin
        .from('guild_threads')
        .select('id')
        .eq('offer_id', offerId)
        .maybeSingle();
      report('offer-thread', Boolean(thread?.id), thread?.id ? 'thread created' : 'no guild_threads row for offer');
      if (thread?.id) {
        cleanup.push(async () => {
          await admin.from('guild_messages').delete().eq('thread_id', thread.id);
          await admin.from('guild_threads').delete().eq('id', thread.id);
        });
      }
    }
  } finally {
    for (const fn of cleanup.reverse()) {
      try {
        await fn();
      } catch (e) {
        console.log('cleanup warning:', e instanceof Error ? e.message : e);
      }
    }
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
