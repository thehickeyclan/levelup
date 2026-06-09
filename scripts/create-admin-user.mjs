#!/usr/bin/env node
/**
 * Create a Guild admin account (auth + public.users). Not parent/coach/youth.
 *
 * Usage:
 *   node scripts/create-admin-user.mjs <email> <firstName> <lastName> [password]
 *
 * If password is omitted, a temporary one is generated and printed once.
 * Requires .env.local with NEXT_PUBLIC_GUILD_SUPABASE_URL + GUILD_SUPABASE_SERVICE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const serviceKey =
  process.env.GUILD_SUPABASE_SERVICE_KEY ||
  process.env.NC_UNITED_SUPABASE_SERVICE_KEY;

const emailRaw = process.argv[2];
const firstName = process.argv[3];
const lastName = process.argv[4];
let password = process.argv[5];

if (!emailRaw || !firstName || !lastName) {
  console.error('Usage: node scripts/create-admin-user.mjs <email> <firstName> <lastName> [password]');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_GUILD_SUPABASE_URL or GUILD_SUPABASE_SERVICE_KEY (.env.local).');
  process.exit(1);
}

const email = emailRaw.toLowerCase().trim();
if (!password) {
  password = `Guild-${randomBytes(4).toString('hex')}!A1`;
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingProfile } = await admin
  .from('users')
  .select('id, email, role')
  .eq('email', email)
  .maybeSingle();

if (existingProfile) {
  const { error: roleErr } = await admin
    .from('users')
    .update({
      role: 'admin',
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    })
    .eq('id', existingProfile.id);
  if (roleErr) {
    console.error('Failed to promote existing user:', roleErr.message);
    process.exit(1);
  }
  const { error: pwdErr } = await admin.auth.admin.updateUserById(existingProfile.id, {
    password,
    email_confirm: true,
  });
  if (pwdErr) {
    console.error('User exists but password update failed:', pwdErr.message);
    process.exit(1);
  }
  console.log(JSON.stringify({
    action: 'promoted_existing',
    email,
    userId: existingProfile.id,
    previousRole: existingProfile.role,
    role: 'admin',
    password,
  }, null, 2));
  process.exit(0);
}

const { data: authData, error: authError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    first_name: firstName.trim(),
    last_name: lastName.trim(),
  },
});

if (authError || !authData.user) {
  console.error('createUser:', authError?.message || 'unknown error');
  process.exit(1);
}

const userId = authData.user.id;
const { error: userErr } = await admin.from('users').insert({
  id: userId,
  email,
  role: 'admin',
  first_name: firstName.trim(),
  last_name: lastName.trim(),
});

if (userErr) {
  await admin.auth.admin.deleteUser(userId);
  console.error('users insert:', userErr.message);
  process.exit(1);
}

console.log(JSON.stringify({
  action: 'created',
  email,
  userId,
  role: 'admin',
  name: `${firstName.trim()} ${lastName.trim()}`,
  password,
}, null, 2));
