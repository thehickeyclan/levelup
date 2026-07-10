import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { sendGuildMessage } from '@/lib/guild-messaging';
import { loadCoachInquiryMessages } from '@/lib/guild-coach-inquiry';
import { MESSAGES_HOME_PATH } from '@/lib/in-app-messaging';

/** GET ?parentId=&athleteId= — coach inquiry thread via guild_messages */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId');
    const athleteId = searchParams.get('athleteId');
    if (!parentId || !athleteId) {
      return NextResponse.json({ error: 'Missing parentId or athleteId' }, { status: 400 });
    }

    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.id !== parentId && user.id !== athleteId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { threadId, messages } = await loadCoachInquiryMessages(
      supabase,
      admin,
      tenant.slug,
      parentId,
      athleteId
    );

    const otherId = user.id === parentId ? athleteId : parentId;
    let otherName = '';

    if (user.id === parentId) {
      const { data: athlete } = await supabase
        .from('athletes')
        .select('first_name, last_name')
        .eq('id', athleteId)
        .single();
      otherName = athlete
        ? [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') || 'Coach'
        : 'Coach';
    } else {
      const { data: parentUser } = await supabase
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', parentId)
        .single();
      otherName =
        [parentUser?.first_name, parentUser?.last_name].filter(Boolean).join(' ').trim() ||
        (parentUser?.email ? `Parent (${parentUser.email})` : 'Parent');
    }

    return NextResponse.json({
      threadId,
      messages: messages.map((m) => ({
        id: m.id,
        parent_id: parentId,
        athlete_id: athleteId,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
      })),
      otherParty: { id: otherId, name: otherName },
    });
  } catch (e) {
    console.error('Coach inquiries GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST { parentId, athleteId, body } — send via guild_messages */
export async function POST(req: NextRequest) {
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

    const body = (await req.json()) as { parentId: string; athleteId: string; body: string };
    const { parentId, athleteId, body: text } = body;
    if (!parentId || !athleteId || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Missing parentId, athleteId, or body' }, { status: 400 });
    }

    if (user.id !== parentId && user.id !== athleteId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { threadId } = await loadCoachInquiryMessages(
      supabase,
      admin,
      tenant.slug,
      parentId,
      athleteId
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`);
    const threadLink = `${baseUrl}${MESSAGES_HOME_PATH}?thread=${threadId}`;

    const message = await sendGuildMessage(supabase, admin, {
      threadId,
      senderId: user.id,
      body: text,
      link: threadLink,
    });

    return NextResponse.json({
      message: {
        id: message.id,
        parent_id: parentId,
        athlete_id: athleteId,
        sender_id: message.sender_id,
        body: message.body,
        created_at: message.created_at,
      },
      threadId,
    });
  } catch (e) {
    console.error('Coach inquiries POST error:', e);
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
