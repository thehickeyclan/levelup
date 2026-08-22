import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

/** PUT: Update only athlete profile visibility (active = public, !active = private). */
export async function PUT(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const makePublic = body.active === true;

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'coach') {
      return NextResponse.json({ error: 'User is not an athlete' }, { status: 400 });
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = createAdminClient(tenant.slug);
    } catch (error: unknown) {
      console.error('Failed to create admin client:', error);
      return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();
    if (makePublic && athlete?.status !== 'active') {
      return NextResponse.json(
        { error: 'Guild verification is required before your public booking profile can go live.' },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('athletes')
      .update({ active: makePublic })
      .eq('id', user.id);

    if (updateError) {
      console.error('Visibility update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, active: makePublic });
  } catch (error) {
    console.error('Error updating visibility:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
