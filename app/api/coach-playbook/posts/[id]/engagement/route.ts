import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const headerStore = await headers();
    const tenant = getTenantFromRequestHeaders(headerStore);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (userRow?.role !== 'coach' && userRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Coach access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const action = body?.action === 'save' ? 'save' : body?.action === 'helpful' ? 'helpful' : null;
    const active = body?.active === true;
    if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const admin = createAdminClient(tenant.slug);
    const table = action === 'save' ? 'coach_playbook_saves' : 'coach_playbook_reactions';
    if (active) {
      const { error } = await admin.from(table).upsert(
        { post_id: id, user_id: user.id },
        { onConflict: 'post_id,user_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from(table).delete().eq('post_id', id).eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('coach playbook engagement:', error);
    return NextResponse.json({ error: 'Could not update video' }, { status: 500 });
  }
}
