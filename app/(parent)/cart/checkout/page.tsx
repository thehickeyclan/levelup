import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { getWrestlersForParentUser } from '@/lib/wrestlers-for-parent';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ensureAutoFamilyDiscountForParent,
  effectivePercentOffForCheckout,
} from '@/lib/family-auto-discount';
import {
  checkoutAllowSavedAccountPercent,
  displayPercentForPromoOnlyCheckout,
} from '@/lib/checkout-promo';
import { CartCheckoutClient } from './cart-checkout-client';

export const metadata = {
  title: 'Checkout | The Guild',
  description: 'Complete your session bookings',
};

export default async function CartCheckoutPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  
  if (!tenant) {
    redirect('/');
  }

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/cart/checkout');
  }

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const savedCheckout = checkoutAllowSavedAccountPercent();
  const admin = createAdminClient(tenant.slug);
  if (userData?.role === 'parent' && savedCheckout) {
    await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
  }

  const wrestlerRows = await getWrestlersForParentUser(admin, user.id);
  const wrestlers = wrestlerRows.map((w) => ({
    id: w.id,
    first_name: w.first_name,
    last_name: w.last_name,
    photo_url: w.photo_url ?? null,
  }));

  // Check if user has an existing percentage discount from signup
  const { data: existingDiscountData } = await supabase
    .from('parent_percentage_discounts')
    .select('percent_off')
    .eq('parent_id', user.id)
    .maybeSingle();

  const existingDiscountEff = savedCheckout
    ? effectivePercentOffForCheckout(existingDiscountData?.percent_off, user.email)
    : await displayPercentForPromoOnlyCheckout(admin, user.email);

  return (
    <div className="container max-w-3xl py-8 px-4">
      <CartCheckoutClient 
        wrestlers={wrestlers ?? []} 
        userEmail={user.email ?? ''} 
        checkoutUsesSavedAccountDiscount={savedCheckout}
        existingDiscount={existingDiscountEff >= 1 ? existingDiscountEff : undefined}
      />
    </div>
  );
}
