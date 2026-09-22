import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

/** Resolve or dismiss a content report, recording reviewer and timestamp. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { action?: string; notes?: string };
    if (body.action !== 'resolve' && body.action !== 'dismiss') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: report, error: readError } = await admin
      .from('content_reports')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (report.status !== 'pending') {
      return NextResponse.json({ error: 'Report is already closed' }, { status: 409 });
    }

    const status = body.action === 'resolve' ? 'resolved' : 'dismissed';
    const { error } = await admin
      .from('content_reports')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes: (body.notes ?? '').trim().slice(0, 1000) || null,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status });
  } catch (e) {
    console.error('Admin content report error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
