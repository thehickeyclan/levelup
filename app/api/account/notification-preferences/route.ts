import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
  patchNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notification-preferences';
import { normalizePhone, sendSms } from '@/lib/twilio';
import { createAdminClient } from '@/lib/supabase/admin';

const PATCH_KEYS: (keyof NotificationPreferences)[] = [
  'new_sessions_sms',
  'reminders_sms',
  'confirmations_sms',
  'new_sessions_push',
  'reminders_push',
  'confirmations_push',
];

export async function GET() {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: row, error } = await supabase
      .from('users')
      .select('notification_preferences, phone')
      .eq('id', user.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      preferences: parseNotificationPreferences(row?.notification_preferences),
      phone: row?.phone ?? null,
    });
  } catch (e) {
    console.error('notification-preferences GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reEnableSms = body.re_enable_sms === true;

    const { data: row, error: fetchErr } = await supabase
      .from('users')
      .select('notification_preferences, phone')
      .eq('id', user.id)
      .single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    let prefs = parseNotificationPreferences(row?.notification_preferences);

    if (reEnableSms) {
      prefs = patchNotificationPreferences(prefs, {
        sms_opted_out: false,
        new_sessions_sms: true,
      });
    } else {
      const patch: Partial<NotificationPreferences> = {};
      for (const key of PATCH_KEYS) {
        if (typeof body[key] === 'boolean') {
          patch[key] = body[key] as boolean;
        }
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'No valid preference fields' }, { status: 400 });
      }
      prefs = patchNotificationPreferences(prefs, patch);
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ notification_preferences: prefs })
      .eq('id', user.id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (reEnableSms) {
      const phone = normalizePhone(row?.phone ?? undefined);
      if (phone) {
        const admin = createAdminClient(tenant.slug);
        void sendSms(
          phone,
          'The Guild: SMS alerts are back on. Reply STOP anytime to opt out.',
          {
            admin,
            messageType: 'sms_opt_in',
            recipientId: user.id,
            recipientLabel: 'Parent',
          }
        );
      }
    }

    return NextResponse.json({ preferences: prefs });
  } catch (e) {
    console.error('notification-preferences PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
