import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { sendCoachApplicationApproved } from '@/lib/email/coach-application-emails';
import { getRequestBaseUrl } from '@/lib/request-base-url';
import { announceDiscoverableCoach } from '@/lib/announce-discoverable-coach';

export async function POST(req: NextRequest) {
  try {
    const hostname = req.headers.get('host') || '';
    const tenant = getTenantByDomain(hostname);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Verify admin user
    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { coachId, adminNotes } = body;

    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID is required' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);

    // Get the coach's current data
    const { data: coach, error: coachError } = await admin
      .from('athletes')
      .select('id, first_name, last_name, status')
      .eq('id', coachId)
      .single();

    if (coachError || !coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    if (coach.status !== 'pending') {
      return NextResponse.json({ error: 'Coach is not in pending status' }, { status: 400 });
    }

    // Approve the coach
    const { error: updateError } = await admin
      .from('athletes')
      .update({
        status: 'active',
        active: true,
        admin_notes: adminNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', coachId);

    if (updateError) {
      return NextResponse.json({ error: `Failed to approve: ${updateError.message}` }, { status: 500 });
    }

    await announceDiscoverableCoach(admin, coachId);

    const { data: coachUser } = await admin
      .from('users')
      .select('email')
      .eq('id', coachId)
      .single();

    if (coachUser?.email) {
      try {
        await sendCoachApplicationApproved({
          to: coachUser.email,
          firstName: coach.first_name,
          tenant,
          baseUrl: getRequestBaseUrl(req),
        });
      } catch (e) {
        console.error('[email] coach approval notify failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${coach.first_name} ${coach.last_name} has been approved`,
    });
  } catch (error) {
    console.error('Approve coach error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
