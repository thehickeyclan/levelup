import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

const BUCKET = 'coach-playbook-videos';

export async function DELETE(
  _req: Request,
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
    const admin = createAdminClient(tenant.slug);
    const { data: post } = await admin
      .from('coach_playbook_posts')
      .select('coach_id, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (!post) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    if (userRow.role !== 'admin' && post.coach_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { error } = await admin.from('coach_playbook_posts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.storage.from(BUCKET).remove([post.storage_path]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('coach playbook DELETE:', error);
    return NextResponse.json({ error: 'Could not delete video' }, { status: 500 });
  }
}
