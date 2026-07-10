import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { ensureCoachInquiryThread } from '@/lib/guild-coach-inquiry';

/** POST { coachUserId } (parent) or { parentId } (coach) — open/create DM thread. */
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    coachUserId?: string;
    parentId?: string;
  };

  let parentId: string;
  let coachUserId: string;

  if (body.coachUserId) {
    parentId = user.id;
    coachUserId = body.coachUserId;
  } else if (body.parentId) {
    parentId = body.parentId;
    coachUserId = user.id;
  } else {
    return NextResponse.json({ error: 'Missing coachUserId or parentId' }, { status: 400 });
  }

  if (user.id !== parentId && user.id !== coachUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = createAdminClient(tenant.slug);
    const threadId = await ensureCoachInquiryThread(admin, tenant.slug, parentId, coachUserId);
    return NextResponse.json({ threadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not open conversation';
    console.error('coach-inquiry thread error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
