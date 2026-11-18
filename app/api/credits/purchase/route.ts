import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import {
  buildGuildCheckoutMetadata,
  guildPaymentIntentData,
} from '@/lib/stripe/guild-checkout-metadata';

const BUNDLE_SIZES = [5, 10] as const;

/**
 * POST — prepay a session bundle. One Stripe charge for qty × the session's
 * list price, landing in the family's existing credit balance on the webhook
 * (category 'credit_bundle'). Deliberately minimal: no pack tracking, no coach
 * configuration — bookings simply spend the credits like any others.
 */
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

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    // Same roles that can book: parents, self-managed athletes, admins.
    if (
      userData?.role !== 'parent' &&
      userData?.role !== 'youth_wrestler' &&
      userData?.role !== 'admin'
    ) {
      return NextResponse.json({ error: 'Only families can prepay sessions' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const coachId = typeof body.coachId === 'string' ? body.coachId : null;
    const productId = typeof body.productId === 'string' ? body.productId : null;
    const qty = BUNDLE_SIZES.includes(body.qty) ? (body.qty as number) : null;
    if (!coachId || !qty) {
      return NextResponse.json({ error: 'Missing bundle details' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);

    // Server-side price: the coach's own product, else the tenant product row.
    let unitPrice = 0;
    let label = 'session';
    if (productId) {
      const { data: coachProduct } = await admin
        .from('athlete_products')
        .select('id, parent_price, name')
        .eq('id', productId)
        .eq('athlete_id', coachId)
        .maybeSingle();
      if (coachProduct) {
        unitPrice = Number(coachProduct.parent_price) || 0;
        label = String(coachProduct.name || 'session');
      } else {
        const { data: tenantProduct } = await admin
          .from('products')
          .select('id, parent_price, name')
          .eq('id', productId)
          .maybeSingle();
        if (tenantProduct) {
          unitPrice = Number(tenantProduct.parent_price) || 0;
          label = String(tenantProduct.name || 'session');
        }
      }
    }
    if (unitPrice <= 0) {
      return NextResponse.json({ error: 'Could not price this bundle' }, { status: 400 });
    }

    const { data: coach } = await admin
      .from('athletes')
      .select('first_name, last_name')
      .eq('id', coachId)
      .maybeSingle();
    const coachName = [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim();

    const totalCents = Math.round(unitPrice * 100) * qty;
    const productName = `${qty}-session bundle${coachName ? ` — ${coachName}` : ''}`;

    const metadata = buildGuildCheckoutMetadata({
      source: 'guild_package',
      tenantSlug: tenant.slug,
      parentId: user.id,
      parentEmail: user.email,
      productName,
      extras: {
        category: 'credit_bundle',
        bundle_qty: String(qty),
        bundle_unit_price: unitPrice.toFixed(2),
        bundle_label: label,
        coach_id: coachId,
      },
    });

    const proto = headersList.get('x-forwarded-proto') || 'https';
    const origin = `${proto}://${host}`;
    const stripe = getStripeInstance(tenant.slug);
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'link', 'cashapp'],
      customer_email: user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: productName,
              description: `${qty} × ${label} at $${unitPrice.toFixed(2)} — credits apply automatically to your next bookings`,
            },
          },
        },
      ],
      metadata,
      payment_intent_data: guildPaymentIntentData(metadata),
      success_url: `${origin}/book/${coachId}?bundle=1`,
      cancel_url: `${origin}/book/${coachId}`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error('Credit bundle purchase error:', e);
    return NextResponse.json({ error: 'Could not start bundle checkout' }, { status: 500 });
  }
}
