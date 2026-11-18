import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import {
  createConnectOnboardingLink,
  getOrCreateCoachConnectAccount,
  isConnectEnabled,
} from '@/lib/stripe/connect';

/**
 * POST — start (or resume) Stripe Connect Express onboarding for the signed-in
 * coach. Returns { url } to redirect the coach to Stripe's hosted onboarding.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isConnectEnabled()) {
      return NextResponse.json({ error: 'Instant payouts are not available yet' }, { status: 404 });
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

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'coach') {
      return NextResponse.json({ error: 'Coaches only' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: coach } = await admin
      .from('athletes')
      .select('id, stripe_account_id, stripe_account_status, stripe_payouts_enabled')
      .eq('id', user.id)
      .maybeSingle();
    if (!coach) return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });

    const stripe = getStripeInstance(tenant.slug);
    const accountId = await getOrCreateCoachConnectAccount(admin, stripe, {
      id: coach.id as string,
      email: user.email,
      stripe_account_id: coach.stripe_account_id as string | null,
    });

    const proto = headersList.get('x-forwarded-proto') || 'https';
    const origin = `${proto}://${host}`;
    const url = await createConnectOnboardingLink(stripe, accountId, origin);

    return NextResponse.json({ url });
  } catch (e) {
    console.error('Connect onboarding error:', e);
    return NextResponse.json({ error: 'Could not start payout setup' }, { status: 500 });
  }
}
