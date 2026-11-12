/**
 * One-off: verify the Nov 12 attribution migration landed in prod.
 * - Checks the three new session_participants columns exist
 * - Checks sessions.open_spots_after_first_booking exists
 * - Checks coach_family_relationships exists and is RLS-locked to service role
 * - Runs recordBookingAttribution against the most recent real paid booking,
 *   reads back what it wrote, then deletes the pair stamp it created
 *   (stamps are meaningful going-forward only; a stamp minted today for an
 *   old pair would record the wrong first session).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { recordBookingAttribution } from '../lib/booking-attribution';

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const env: Record<string, string> = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_NC_UNITED_SUPABASE_URL;
const serviceKey = env.NC_UNITED_SUPABASE_SERVICE_KEY;
const anonKey = env.NEXT_PUBLIC_NC_UNITED_SUPABASE_ANON_KEY;
if (!url || !serviceKey) throw new Error('missing env');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

async function main() {
  // 1. Schema probes
  const p1 = await admin
    .from('session_participants')
    .select('id, booking_source, occupancy_at_booking, prior_relationship')
    .limit(1);
  console.log('session_participants new columns:', p1.error ? `FAIL ${p1.error.message}` : 'OK');

  const p2 = await admin.from('sessions').select('id, open_spots_after_first_booking').limit(1);
  console.log('sessions.open_spots_after_first_booking:', p2.error ? `FAIL ${p2.error.message}` : 'OK');

  const p3 = await admin.from('coach_family_relationships').select('id').limit(1);
  console.log('coach_family_relationships table:', p3.error ? `FAIL ${p3.error.message}` : `OK (${p3.data?.length ?? 0} rows)`);

  // 2. RLS: anon must see nothing
  if (anon) {
    const a = await anon.from('coach_family_relationships').select('id').limit(1);
    const locked = a.error != null || (a.data ?? []).length === 0;
    console.log('RLS lock (anon read):', locked ? 'OK (denied/empty)' : 'FAIL — anon can read!');
  }

  // 3. Live write test on the most recent real paid booking
  const { data: recent } = await admin
    .from('session_participants')
    .select('id, session_id, parent_id, created_at')
    .eq('paid', true)
    .not('parent_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = recent?.[0];
  if (!row) {
    console.log('no paid booking found to test with');
    return;
  }
  console.log(`test row: participant ${row.id} (booked ${row.created_at})`);

  await recordBookingAttribution(admin, { sessionId: row.session_id, parentId: row.parent_id, source: null });

  const { data: after } = await admin
    .from('session_participants')
    .select('booking_source, occupancy_at_booking, prior_relationship')
    .eq('id', row.id)
    .maybeSingle();
  console.log('written back:', JSON.stringify(after));

  const { data: sess } = await admin
    .from('sessions')
    .select('athlete_id')
    .eq('id', row.session_id)
    .maybeSingle();
  const { data: stamp } = await admin
    .from('coach_family_relationships')
    .select('id, coach_id, parent_id, first_session_id, occupancy_at_first_booking, created_at')
    .eq('coach_id', sess?.athlete_id ?? '')
    .eq('parent_id', row.parent_id)
    .maybeSingle();
  console.log('pair stamp created:', stamp ? 'YES' : 'NO');

  // 4. Cleanup: remove the test stamp (going-forward semantics only)
  if (stamp) {
    const del = await admin.from('coach_family_relationships').delete().eq('id', stamp.id);
    console.log('test stamp deleted:', del.error ? `FAIL ${del.error.message}` : 'OK');
  }
  const { count } = await admin
    .from('coach_family_relationships')
    .select('id', { count: 'exact', head: true });
  console.log('coach_family_relationships rows after cleanup:', count);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
