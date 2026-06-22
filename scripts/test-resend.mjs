#!/usr/bin/env node
/**
 * Send a test email via Resend using .env.local credentials.
 *
 * Usage:
 *   node scripts/test-resend.mjs your@email.com
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = v;
  }
}

loadDotEnvLocal();

const to = process.argv[2]?.trim();
const key = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim() || 'The Guild <onboarding@resend.dev>';

if (!to) {
  console.error('Usage: node scripts/test-resend.mjs <to-email>');
  process.exit(1);
}
if (!key) {
  console.error('RESEND_API_KEY is not set in .env.local');
  console.error('');
  console.error('Add:');
  console.error('  RESEND_API_KEY=re_...');
  console.error('  EMAIL_FROM=The Guild <noreply@your-verified-domain.com>');
  process.exit(1);
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: 'The Guild — Resend test',
    html: '<p>If you received this, Resend is configured correctly for LevelUp.</p>',
    text: 'If you received this, Resend is configured correctly for LevelUp.',
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Resend API error:', res.status, body);
  process.exit(1);
}

console.log('Test email sent to', to, 'from', from);
if (body.id) console.log('Resend id:', body.id);
