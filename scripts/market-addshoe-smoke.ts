/**
 * End-to-end smoke test of the iPhone add-shoe chain against a live backend,
 * replicating the app's exact call order and defaults. Run before claiming
 * any add-shoe change works:
 *
 *   npx tsx scripts/market-addshoe-smoke.ts https://www.wrestlingguild.com <image-url>
 *
 * Uses a magiclink-minted session for MARKET_SMOKE_EMAIL (default: admin owner).
 * Creates a draft listing, exercises upload → clean → shoe-id → condition →
 * price → description, prints PASS/FAIL per step, then deletes the draft.
 */
import { createClient } from '@supabase/supabase-js';
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
const IMAGE_URL = process.argv[3] || '';
const EMAIL = process.env.MARKET_SMOKE_EMAIL || 'thehickeyclan@gmail.com';

let failures = 0;

function report(step: string, ok: boolean, detail: string) {
  failures += ok ? 0 : 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.padEnd(18)} ${detail}`);
}

async function main() {
  if (!IMAGE_URL.startsWith('http')) {
    console.error('Provide a public image URL of a shoe as the second argument.');
    process.exit(1);
  }
  const admin = createClient(url, service);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  });
  if (linkErr) throw linkErr;
  const client = createClient(url, anon);
  const { data: verifyData, error: verifyErr } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties!.hashed_token,
  });
  if (verifyErr) throw verifyErr;
  const H = {
    Authorization: `Bearer ${verifyData.session!.access_token}`,
    'x-tenant-slug': 'guild',
    'Content-Type': 'application/json',
  };
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}${path}`, { headers: H, ...init });
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-json */
    }
    return { status: res.status, body };
  };

  const imgRes = await fetch(IMAGE_URL);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const base64 = imgBuf.toString('base64');
  const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
  console.log(`photo: ${imgBuf.length} bytes ${mimeType}\n`);

  // App default on entry: listing_type collection, no brand yet (draft).
  const create = await call('/api/market/listings', {
    method: 'POST',
    body: JSON.stringify({
      draft: true,
      title: 'Wrestling sneakers',
      listing_type: 'collection',
      wear_state: 'used',
      condition: 'good',
      size: 10,
    }),
  });
  const listingId = create.body.listingId as string | undefined;
  report('create-draft', create.status === 200 && Boolean(listingId), `status ${create.status}`);
  if (!listingId) process.exit(1);

  const upload = await call(`/api/market/listings/${listingId}/images`, {
    method: 'POST',
    body: JSON.stringify({ fileName: 'smoke-shoe.jpg', mimeType, base64 }),
  });
  const image = upload.body.image as { id?: string; public_url?: string } | undefined;
  report('upload-photo', upload.status === 200 && Boolean(image?.id), `status ${upload.status}`);

  if (image?.id) {
    const clean = await call(`/api/market/listings/${listingId}/images/${image.id}/clean`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    report(
      'clean-background',
      clean.status === 200 && clean.body.success === true,
      `status ${clean.status} ${JSON.stringify(clean.body).slice(0, 120)}`
    );
  }

  const shoeId = await call('/api/market/shoe-id', {
    method: 'POST',
    body: JSON.stringify({ listingId, images: [image?.public_url].filter(Boolean) }),
  });
  const idResult = shoeId.body.result as { brand?: string; model?: string; colorway?: string } | undefined;
  report(
    'shoe-id',
    shoeId.status === 200 && Boolean(idResult?.brand || idResult?.model),
    `status ${shoeId.status} → ${idResult?.brand ?? '?'} ${idResult?.model ?? '?'} · ${idResult?.colorway ?? ''}`
  );

  const brand = idResult?.brand || 'ASICS';
  const model = idResult?.model || 'Unknown';

  const condition = await call('/api/market/ai/condition', {
    method: 'POST',
    body: JSON.stringify({ listingId, wear_state: 'used' }),
  });
  const grade = (condition.body.analysis as { grade?: string } | undefined)?.grade;
  report(
    'ai-condition',
    condition.status === 200 && Boolean(grade),
    `status ${condition.status} → grade ${grade ?? 'none'}${condition.body.warning ? ' (warning)' : ''}`
  );

  // Value must work for EVERY listing type — collection pairs get an estimate too.
  const price = await call('/api/market/ai/price', {
    method: 'POST',
    body: JSON.stringify({
      listingId,
      brand,
      model,
      size: 10,
      condition: grade || 'good',
      listing_type: 'collection',
      wear_state: 'used',
    }),
  });
  const mid = (price.body.price as { suggested_mid_cents?: number } | undefined)?.suggested_mid_cents;
  report(
    'ai-value',
    price.status === 200 && typeof mid === 'number' && mid > 0,
    `status ${price.status} → ${typeof mid === 'number' ? `$${Math.round(mid / 100)}` : JSON.stringify(price.body).slice(0, 120)}`
  );

  const agent = await call('/api/market/ai/agent', {
    method: 'POST',
    body: JSON.stringify({
      draftId: listingId,
      messages: [
        {
          role: 'user',
          content: `Write one buyer-facing wrestling shoe listing paragraph, 60-100 words.\nBrand: ${brand}\nModel: ${model}\nWear state: used\nReturn valid JSON with has_draft true and draft.description.`,
        },
      ],
    }),
  });
  const description = (agent.body.draft as { description?: string } | undefined)?.description;
  report(
    'ai-description',
    agent.status === 200 && Boolean(description && description.length > 40),
    `status ${agent.status} → ${(description ?? '').slice(0, 70)}…`
  );

  const del = await call(`/api/market/listings/${listingId}`, { method: 'DELETE' });
  report('delete-draft', del.status === 200, `status ${del.status}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
