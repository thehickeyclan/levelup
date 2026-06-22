#!/usr/bin/env node
/**
 * Generate a one-time password reset link (no email) for local QA.
 *
 * Usage:
 *   node scripts/test-password-reset-link.mjs user@example.com
 *
 * Requires .env.local with Guild Supabase URL + service key.
 * Open the printed URL in a browser to complete reset on that origin.
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

const email = process.argv[2]?.trim().toLowerCase();
const explicitSite =
  process.argv[3]?.trim() ||
  process.env.VERIFY_BASE_URL?.trim() ||
  '';
const envAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
const siteUrl = (
  explicitSite ||
  (envAppUrl.includes('localhost') ? envAppUrl : '') ||
  'http://localhost:3000'
).replace(/\/$/, '');

const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const service =
  process.env.GUILD_SUPABASE_SERVICE_KEY ||
  process.env.NC_UNITED_SUPABASE_SERVICE_KEY;

if (!email) {
  console.error('Usage: node scripts/test-password-reset-link.mjs <email> [base-url]');
  console.error('Example: node scripts/test-password-reset-link.mjs you@example.com http://localhost:3001');
  process.exit(1);
}
if (!url || !service) {
  console.error('Missing Supabase URL or service key in .env.local');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({
  type: 'recovery',
  email,
  options: { redirectTo: `${siteUrl}/auth/confirm` },
});

if (error) {
  console.error('generateLink failed:', error.message);
  process.exit(1);
}

const hashedToken = data?.properties?.hashed_token;
if (!hashedToken) {
  console.error('No hashed_token in generateLink response');
  process.exit(1);
}

const params = new URLSearchParams({
  token_hash: hashedToken,
  type: 'recovery',
  next: '/reset-password',
});
const resetUrl = `${siteUrl}/auth/confirm?${params.toString()}`;

console.log('Password reset test link (single use):');
console.log('');
console.log(resetUrl);
console.log('');
console.log('>>> Copy the URL above into your BROWSER address bar (Safari/Chrome).');
console.log('>>> Do NOT paste it in Terminal — zsh breaks on & in the URL.');
if (process.platform === 'darwin') {
  console.log('');
  console.log('Or run: open "' + resetUrl + '"');
}
if (envAppUrl && !envAppUrl.includes('localhost') && !explicitSite) {
  console.log('');
  console.log(
    `Note: NEXT_PUBLIC_APP_URL is ${envAppUrl} — for local dev pass the dev URL as the third argument.`
  );
}
console.log('');
console.log('Expected flow: auth/confirm → /reset-password → new password → sign in.');
