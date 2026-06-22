#!/usr/bin/env node
/** Quick check: does generateLink + verifyOtp work with project keys? */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = v;
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL || process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const anon =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_ANON_KEY;
const service =
  process.env.GUILD_SUPABASE_SERVICE_KEY || process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
const email = process.argv[2]?.trim().toLowerCase();

if (!email || !supabaseUrl || !anon || !service) {
  console.error('Usage: node scripts/verify-recovery-token.mjs <email>');
  process.exit(1);
}

const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });
const pub = createClient(supabaseUrl, anon, { auth: { persistSession: false } });

const { data, error: genErr } = await admin.auth.admin.generateLink({
  type: 'recovery',
  email,
  options: { redirectTo: 'http://localhost:3001/auth/confirm' },
});
if (genErr) {
  console.error('generateLink:', genErr.message);
  process.exit(1);
}

const token_hash = data?.properties?.hashed_token;
if (!token_hash) {
  console.error('No hashed_token');
  process.exit(1);
}

const { data: verifyData, error: verifyErr } = await pub.auth.verifyOtp({
  type: 'recovery',
  token_hash,
});

if (verifyErr) {
  console.error('verifyOtp FAILED:', verifyErr.message);
  process.exit(1);
}

console.log('verifyOtp OK for', verifyData.user?.email);
console.log('Session user id:', verifyData.session?.user?.id ?? 'none');
