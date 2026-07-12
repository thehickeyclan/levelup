#!/usr/bin/env node
/**
 * Refund Brooks Apr 24 test session ($50) to parent wallet + cancel session.
 *
 * Usage:
 *   node scripts/refund-brooks-test-session-wallet.mjs          # audit
 *   node scripts/refund-brooks-test-session-wallet.mjs --apply
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SESSION_ID = '108228fc-e7b5-45ee-bc84-3fcdc30cb6bf';
const PARENT_EMAIL = 'thehickeyclan@gmail.com';
const REFUND_USD = 50;

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

loadDotEnvLocal();

const apply = process.argv.includes('--apply');
const url =
  process.env.NEXT_PUBLIC_GUILD_SUPABASE_URL || process.env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const key = process.env.GUILD_SUPABASE_SERVICE_KEY || process.env.NC_UNITED_SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL/service key in .env.local');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('id, email, role')
    .ilike('email', PARENT_EMAIL)
    .maybeSingle();

  if (userErr || !user) {
    console.error('Parent user not found:', userErr?.message ?? PARENT_EMAIL);
    process.exit(1);
  }

  const { data: session, error: sessErr } = await admin
    .from('sessions')
    .select('id, status, scheduled_datetime, athlete_id')
    .eq('id', SESSION_ID)
    .maybeSingle();

  if (sessErr) {
    console.error('Session lookup failed:', sessErr.message);
    process.exit(1);
  }

  const { data: participants, error: partErr } = await admin
    .from('session_participants')
    .select('id, parent_id, youth_wrestler_id, paid, amount_paid, youth_wrestlers(first_name, last_name)')
    .eq('session_id', SESSION_ID);

  if (partErr) {
    console.error('Participants lookup failed:', partErr.message);
    process.exit(1);
  }

  const paidRow = (participants ?? []).find((p) => p.paid === true);
  const amount = Number(paidRow?.amount_paid ?? 0);
  const parentId = (paidRow?.parent_id as string | null) ?? user.id;

  const { data: existingCredit } = await admin
    .from('credits')
    .select('id, amount, remaining, description')
    .eq('source_session_id', SESSION_ID)
    .eq('parent_id', parentId)
    .maybeSingle();

  console.log('--- Audit ---');
  console.log('Parent:', user.email, user.id, `(${user.role})`);
  console.log('Session:', session ? `${session.id} status=${session.status}` : 'NOT FOUND (may already be deleted)');
  console.log(
    'Paid participant:',
    paidRow
      ? `${paidRow.youth_wrestlers?.first_name ?? ''} ${paidRow.youth_wrestlers?.last_name ?? ''} $${amount}`
      : 'none'
  );
  console.log('Credit parent_id:', parentId);
  console.log('Existing credit for session:', existingCredit ?? 'none');

  if (existingCredit) {
    console.log('\nWallet credit already issued for this session. Nothing to do.');
    return;
  }

  if (!paidRow || amount <= 0) {
    console.error('\nNo paid participant row — cannot refund.');
    process.exit(1);
  }

  const refundAmount = amount > 0 ? amount : REFUND_USD;
  const description =
    'Test session refund — Brooks Apr 24 partner slot (wallet credit for Gavin bookings)';

  if (!apply) {
    console.log(`\nDry run. Would grant $${refundAmount.toFixed(2)} to ${PARENT_EMAIL} and cancel session.`);
    console.log('Re-run with --apply to execute.');
    return;
  }

  const { data: credit, error: creditErr } = await admin
    .from('credits')
    .insert({
      parent_id: parentId,
      amount: refundAmount,
      remaining: refundAmount,
      source: 'admin_grant',
      source_session_id: SESSION_ID,
      description,
      expires_at: null,
    })
    .select('id')
    .single();

  if (creditErr) {
    console.error('Credit insert failed:', creditErr.message);
    process.exit(1);
  }

  if (session && session.status === 'scheduled') {
    const now = new Date().toISOString();
    const { error: cancelErr } = await admin
      .from('sessions')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancellation_reason: description,
        updated_at: now,
      })
      .eq('id', SESSION_ID);

    if (cancelErr) {
      console.error('Session cancel failed (credit was issued):', cancelErr.message);
      process.exit(1);
    }

    await admin
      .from('session_participants')
      .update({ status: 'cancelled' })
      .eq('session_id', SESSION_ID);
  }

  const { data: balanceRows } = await admin
    .from('credits')
    .select('remaining, expires_at')
    .eq('parent_id', parentId)
    .gt('remaining', 0);

  const balance = (balanceRows ?? []).reduce((sum, r) => sum + Number(r.remaining ?? 0), 0);

  console.log('\nDone.');
  console.log(`Credit id: ${credit.id}`);
  console.log(`Granted: $${refundAmount.toFixed(2)}`);
  console.log(`Wallet balance: $${balance.toFixed(2)}`);
  console.log('Use at checkout for Gavin — /wallet or pay with wallet on next booking.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
