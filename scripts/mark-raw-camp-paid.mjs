#!/usr/bin/env node
/**
 * Mark school team camp Jul 10–12 roster paid @ $30/spot (WG-2026-TEAM-0710).
 *
 * Usage:
 *   node scripts/mark-raw-camp-paid.mjs          # dry run (audit only)
 *   node scripts/mark-raw-camp-paid.mjs --apply  # update DB
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CAMP_EMAILS = [
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com',
];

const CAMP_DATES = new Set(['2026-07-10', '2026-07-11', '2026-07-12']);
const UNIT_USD = 30;
const INVOICE_REF = 'WG-2026-TEAM-0710';
const ORDER_REF = 'NC-C31KCQ-XNJL';

function loadDotEnvLocal() {
  const p = join(__dirname, '..', '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function sessionDateEt(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

loadDotEnvLocal();

const apply = process.argv.includes('--apply');
const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL || process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.GUILD_SUPABASE_SERVICE_KEY || process.env.NC_UNITED_SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL or service key in .env.local');
  process.exit(1);
}

const sb = createClient(url, key);

const { data: users, error: usersErr } = await sb.from('users').select('id, email').in('email', CAMP_EMAILS);
if (usersErr) {
  console.error(usersErr.message);
  process.exit(1);
}

const wrestlerIds = (users ?? []).map((u) => u.id);
if (wrestlerIds.length !== CAMP_EMAILS.length) {
  console.warn(`Found ${wrestlerIds.length}/${CAMP_EMAILS.length} camp wrestler accounts`);
}

const { data: rows, error: rowsErr } = await sb
  .from('session_participants')
  .select(
    'id, paid, amount_paid, payment_method, session_id, sessions!inner(scheduled_datetime, price_per_participant, athletes(first_name, last_name)), youth_wrestlers!inner(first_name, last_name)'
  )
  .in('youth_wrestler_id', wrestlerIds);

if (rowsErr) {
  console.error(rowsErr.message);
  process.exit(1);
}

const campRows = (rows ?? []).filter((r) => CAMP_DATES.has(sessionDateEt(r.sessions.scheduled_datetime)));

campRows.sort((a, b) =>
  a.sessions.scheduled_datetime.localeCompare(b.sessions.scheduled_datetime)
);

console.log(`Invoice ${INVOICE_REF} · order ${ORDER_REF}`);
console.log(`Camp spots in range: ${campRows.length} (expect 24)`);

let needUpdate = 0;
for (const r of campRows) {
  const coach = r.sessions.athletes;
  const coachName = coach ? `${coach.first_name} ${coach.last_name}`.trim() : 'Coach';
  const wrestler = `${r.youth_wrestlers.first_name} ${r.youth_wrestlers.last_name}`.trim();
  const ok = r.paid === true && Number(r.amount_paid) >= UNIT_USD;
  if (!ok) needUpdate++;
  console.log(
    `${ok ? '✓' : '○'} ${sessionDateEt(r.sessions.scheduled_datetime)} ${coachName} · ${wrestler} · paid=${r.paid} amt=${r.amount_paid ?? 0}`
  );
}

const paidTotal = campRows.reduce((s, r) => s + (r.paid && r.amount_paid ? Number(r.amount_paid) : 0), 0);
console.log(`Current collected: $${paidTotal.toFixed(2)} (target $720.00)`);

if (!apply) {
  console.log(`\nDry run — ${needUpdate} row(s) would be updated. Re-run with --apply to mark paid @ $${UNIT_USD}.`);
  process.exit(0);
}

if (needUpdate === 0 && campRows.length === 24 && paidTotal >= 720) {
  console.log('\nAlready aligned — no changes needed.');
  process.exit(0);
}

const ids = campRows.map((r) => r.id);
const { error: updErr } = await sb
  .from('session_participants')
  .update({
    paid: true,
    amount_paid: UNIT_USD,
    payment_method: 'stripe',
    status: 'confirmed',
  })
  .in('id', ids);

if (updErr) {
  console.error('Update failed:', updErr.message);
  process.exit(1);
}

const sessionIds = [...new Set(campRows.map((r) => r.session_id))];
for (const sessionId of sessionIds) {
  await sb.from('sessions').update({ price_per_participant: UNIT_USD, updated_at: new Date().toISOString() }).eq('id', sessionId);
}

console.log(`\nUpdated ${ids.length} participant row(s) @ $${UNIT_USD} each.`);
console.log(`Expected total: $${(ids.length * UNIT_USD).toFixed(2)}`);
