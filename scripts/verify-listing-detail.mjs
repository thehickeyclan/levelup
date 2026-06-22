#!/usr/bin/env node
/**
 * Smoke test: sign in, fetch listing detail API for seller's listings, assert no 500.
 * Usage: node scripts/verify-listing-detail.mjs [email] [password]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnvLocal() {
  const p = join(__dirname, '..', '.env.local');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const anon =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_ANON_KEY;
const service =
  process.env.GUILD_SUPABASE_SERVICE_KEY ||
  process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
const baseUrl = process.env.VERIFY_BASE_URL || 'http://localhost:3001';
const email = process.argv[2] || process.env.VERIFY_EMAIL;
const password = process.argv[3] || process.env.VERIFY_PASSWORD;

if (!url || !anon || !service) {
  console.error('Missing Supabase env (NEXT_PUBLIC_GUILD_SUPABASE_URL, anon, service key)');
  process.exit(1);
}
if (!email || !password) {
  console.error('Pass email and password args or set VERIFY_EMAIL / VERIFY_PASSWORD');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const authClient = createClient(url, anon, { auth: { persistSession: false } });

const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
  email,
  password,
});
if (signInErr || !signIn.session) {
  console.error('Sign-in failed:', signInErr?.message || 'no session');
  process.exit(1);
}

const accessToken = signIn.session.access_token;
const userId = signIn.user.id;

const { data: listings, error: listErr } = await admin
  .from('market_listings')
  .select('id, title, status, listing_type, wear_state')
  .eq('seller_id', userId)
  .order('updated_at', { ascending: false })
  .limit(8);

if (listErr) {
  console.error('List listings failed:', listErr.message);
  process.exit(1);
}

if (!listings?.length) {
  console.log('No listings for user — cannot smoke-test detail API');
  process.exit(0);
}

console.log(`Testing ${listings.length} listings against ${baseUrl} …`);

let failed = 0;
for (const row of listings) {
  const res = await fetch(`${baseUrl}/api/market/listings/${row.id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Cookie: `sb-guild-auth-token=base64-${Buffer.from(
        JSON.stringify(signIn.session)
      ).toString('base64')}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  const ok = res.ok && body.listing;
  const label = `${row.id.slice(0, 8)}… ${row.listing_type}/${row.status} ${row.title?.slice(0, 40) || ''}`;
  if (ok) {
    console.log(`  OK  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${res.status} ${label} — ${body.error || 'no listing'}`);
  }

  const qaRes = await fetch(`${baseUrl}/api/market/listings/${row.id}/qa`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const qaBody = await qaRes.json().catch(() => ({}));
  if (!qaRes.ok) {
    console.log(`  QA  WARN ${row.id.slice(0, 8)}… ${qaRes.status} ${qaBody.error || ''}`);
  } else if (qaBody.thread_id) {
    console.log(`  QA  thread ${qaBody.thread_id.slice(0, 8)}… for ${row.id.slice(0, 8)}…`);
  }
}

if (failed) {
  console.error(`${failed} listing(s) failed GET detail`);
  process.exit(1);
}

console.log('All listing detail API checks passed.');
