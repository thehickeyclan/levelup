import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

/** GET - list linked parents for this youth wrestler (primary parent can see all; linked parents see themselves and primary). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: youthWrestlerId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // RLS lets each parent read only their own rows, so the primary parent
    // would see an empty link list and a linked parent may not see the
    // wrestler row at all. Authenticate with the user client above, then read
    // with the admin client and authorize explicitly below.
    const admin = createAdminClient(tenant.slug);
    const { data: yw } = await admin.from('youth_wrestlers').select('parent_id').eq('id', youthWrestlerId).single();
    if (!yw) return NextResponse.json({ error: 'Youth wrestler not found' }, { status: 404 });

    const isPrimary = yw.parent_id === user.id;
    const { data: links } = await admin.from('youth_wrestler_parents').select('parent_id, added_at').eq('youth_wrestler_id', youthWrestlerId);
    const linkedParentIds = (links ?? []).map((r) => r.parent_id);
    if (!isPrimary && !linkedParentIds.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allParentIds = [yw.parent_id, ...linkedParentIds];
    const { data: users } = await admin.from('users').select('id, email').in('id', allParentIds);
    const byId = new Map((users ?? []).map((u) => [u.id, u]));

    const parents = allParentIds.map((pid) => {
      const u = byId.get(pid);
      return {
        parentId: pid,
        email: u?.email ?? '',
        isPrimary: pid === yw.parent_id,
      };
    });

    return NextResponse.json({ parents });
  } catch (e) {
    console.error('Youth wrestler parents GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST - add a linked parent (primary parent only). Body: { email } - invite by email. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: youthWrestlerId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: yw } = await supabase.from('youth_wrestlers').select('parent_id').eq('id', youthWrestlerId).single();
    if (!yw || yw.parent_id !== user.id) {
      return NextResponse.json({ error: 'Only the primary parent can add another parent' }, { status: 403 });
    }

    const body = (await req.json()) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

    const { data: otherUser } = await supabase.from('users').select('id, role').eq('email', email).single();
    if (!otherUser) return NextResponse.json({ error: 'No account found with that email' }, { status: 404 });
    if (otherUser.role !== 'parent') return NextResponse.json({ error: 'That account is not a parent' }, { status: 400 });
    if (otherUser.id === user.id) return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });

    const { error } = await supabase.from('youth_wrestler_parents').insert({
      youth_wrestler_id: youthWrestlerId,
      parent_id: otherUser.id,
    });

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That parent is already linked' }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Youth wrestler parents POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE - unlink current user from this youth wrestler (linked parent only). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: youthWrestlerId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: yw } = await supabase.from('youth_wrestlers').select('parent_id').eq('id', youthWrestlerId).single();
    if (!yw) return NextResponse.json({ error: 'Youth wrestler not found' }, { status: 404 });
    if (yw.parent_id === user.id) {
      return NextResponse.json({ error: 'Primary parent cannot unlink; transfer primary or delete the profile from the edit page' }, { status: 400 });
    }

    const { error } = await supabase
      .from('youth_wrestler_parents')
      .delete()
      .eq('youth_wrestler_id', youthWrestlerId)
      .eq('parent_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Youth wrestler parents DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
