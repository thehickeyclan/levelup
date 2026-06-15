import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { normalizePhone } from '@/lib/twilio';
import {
  parseNotificationPreferences,
  patchNotificationPreferences,
} from '@/lib/notification-preferences';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);

/**
 * Twilio inbound SMS webhook — handles STOP opt-out.
 * Configure in Twilio Console → Phone Number / Messaging Service → Incoming webhook URL:
 * https://www.wrestlingguild.com/api/twilio/inbound
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return twimlResponse();

    const form = await req.formData();
    const body = String(form.get('Body') ?? '').trim().toUpperCase();
    const fromRaw = String(form.get('From') ?? '');
    const phone = normalizePhone(fromRaw);

    if (!phone || !STOP_WORDS.has(body)) {
      return twimlResponse();
    }

    const admin = createAdminClient(tenant.slug);
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return twimlResponse();

    const { data: users } = await admin
      .from('users')
      .select('id, phone, notification_preferences')
      .not('phone', 'is', null);

    const matches = (users ?? []).filter((u) => {
      const p = normalizePhone(u.phone ?? undefined);
      return p && p.replace(/\D/g, '').slice(-10) === digits;
    });

    for (const u of matches) {
      const prefs = patchNotificationPreferences(parseNotificationPreferences(u.notification_preferences), {
        sms_opted_out: true,
        new_sessions_sms: false,
        reminders_sms: false,
        confirmations_sms: false,
      });
      await admin.from('users').update({ notification_preferences: prefs }).eq('id', u.id);
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from Guild SMS alerts. Manage alerts in your account settings.</Message></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  } catch (e) {
    console.error('Twilio inbound webhook error:', e);
    return twimlResponse();
  }
}

function twimlResponse(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
