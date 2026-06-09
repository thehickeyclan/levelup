import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  COACH_ADMIN_SMS_MAX_BODY,
  listCoachSmsRecipients,
  sendCoachAdminBroadcast,
} from '@/lib/coach-admin-sms';

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient(auth.tenantSlug);
  try {
    const coaches = await listCoachSmsRecipients(admin);
    const withPhone = coaches.filter((c) => c.hasPhone).length;
    const withoutPhone = coaches.length - withPhone;
    return NextResponse.json({ coaches, withPhone, withoutPhone, total: coaches.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load coaches';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: { message?: string; coachIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > COACH_ADMIN_SMS_MAX_BODY) {
    return NextResponse.json(
      { error: `Message must be ${COACH_ADMIN_SMS_MAX_BODY} characters or fewer` },
      { status: 400 }
    );
  }

  const coachIds = Array.isArray(body.coachIds)
    ? body.coachIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined;

  const admin = createAdminClient(auth.tenantSlug);
  try {
    const coaches = await listCoachSmsRecipients(admin);
    const missing = coaches.filter((c) => !c.hasPhone);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot send: ${missing.length} active coach${missing.length === 1 ? '' : 'es'} missing a cell phone. Fix in Admin → Users first.`,
          missingCoaches: missing,
        },
        { status: 409 }
      );
    }

    const result = await sendCoachAdminBroadcast(admin, message, { coachIds });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
