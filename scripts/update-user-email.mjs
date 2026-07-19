#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = join(scriptDir, '..', '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const separator = text.indexOf('=');
    if (separator < 1) continue;
    const key = text.slice(0, separator).trim();
    let value = text.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const serviceKey =
  process.env.GUILD_SUPABASE_SERVICE_KEY ||
  process.env.NC_UNITED_SUPABASE_SERVICE_KEY;
const oldEmail = process.argv[2]?.trim().toLowerCase();
const newEmail = process.argv[3]?.trim().toLowerCase();

if (!url || !serviceKey) {
  console.error('Missing Guild Supabase URL or service key in .env.local.');
  process.exit(1);
}
if (!oldEmail || !newEmail) {
  console.error('Usage: node scripts/update-user-email.mjs <old-email> <new-email>');
  process.exit(1);
}
if (oldEmail === newEmail) {
  console.error('Old and new email addresses are identical.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let oldAuthUser;
let newAuthUser;
for (let page = 1; page <= 200; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users ?? []) {
    const email = user.email?.toLowerCase();
    if (email === oldEmail) oldAuthUser = user;
    if (email === newEmail) newAuthUser = user;
  }
  if ((data.users ?? []).length < 1000 || (oldAuthUser && newAuthUser)) break;
}

if (!oldAuthUser) {
  console.error(`No authentication user found for ${oldEmail}.`);
  process.exit(1);
}
if (newAuthUser && newAuthUser.id !== oldAuthUser.id) {
  console.error(`The new address is already used by another authentication account.`);
  process.exit(1);
}

const { data: conflictingProfile, error: conflictError } = await admin
  .from('users')
  .select('id')
  .ilike('email', newEmail)
  .neq('id', oldAuthUser.id)
  .maybeSingle();
if (conflictError) throw conflictError;
if (conflictingProfile) {
  console.error('The new address is already used by another user profile.');
  process.exit(1);
}

const { error: authUpdateError } = await admin.auth.admin.updateUserById(oldAuthUser.id, {
  email: newEmail,
  email_confirm: true,
});
if (authUpdateError) throw authUpdateError;

const { data: profile, error: profileUpdateError } = await admin
  .from('users')
  .update({ email: newEmail, updated_at: new Date().toISOString() })
  .eq('id', oldAuthUser.id)
  .select('id, role')
  .single();

if (profileUpdateError) {
  const { error: rollbackError } = await admin.auth.admin.updateUserById(oldAuthUser.id, {
    email: oldEmail,
    email_confirm: true,
  });
  if (rollbackError) {
    console.error(`Profile update failed and Auth rollback also failed: ${rollbackError.message}`);
  }
  throw profileUpdateError;
}

console.log(`Updated ${oldEmail} to ${newEmail} (${profile.role}, ${profile.id}).`);
