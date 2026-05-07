import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { hasMinPhoneDigits } from '@/lib/phone';

const ACCOUNT = '/account';

function pathnameAllowsMissingUserPhone(pathname: string): boolean {
  if (!pathname || pathname.startsWith('/api') || pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/login')) return true;
  if (
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')
  )
    return true;
  if (pathname === ACCOUNT || pathname.startsWith(`${ACCOUNT}/`)) return true;
  if (pathname.startsWith('/invite-parent')) return true;
  if (pathname.startsWith('/onboarding')) return true;
  if (pathname.startsWith('/profile')) return true;
  return false;
}

/**
 * Redirect signed-in parents, admins, coaches, and athlete accounts if they lack a usable cell number.
 * - Parents / admins / athlete (youth): `/account`
 * - Coaches: `/profile?cell=required` (coach account page redirects away from `/account`).
 * Skips anonymous users, login/signup, `/account`, `/profile`, onboarding, API routes, etc.
 */
export async function redirectIfMissingUserCellPhone(): Promise<void> {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  if (pathnameAllowsMissingUserPhone(pathname)) return;

  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: row } = await supabase.from('users').select('role, phone').eq('id', user.id).maybeSingle();
  if (!row?.role) return;

  const role = row.role as string;
  if (!['parent', 'coach', 'admin', 'youth_wrestler'].includes(role)) return;

  if (role === 'coach') {
    if (hasMinPhoneDigits((row as { phone?: string | null }).phone)) return;
    redirect('/profile?cell=required');
  }

  if (role === 'youth_wrestler') {
    const { data: yw } = await supabase
      .from('youth_wrestlers')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle();
    const ywPhone = (yw as { phone?: string | null } | null)?.phone;
    const userPhone = (row as { phone?: string | null }).phone;
    if (hasMinPhoneDigits(userPhone) || hasMinPhoneDigits(ywPhone)) return;
    redirect(`${ACCOUNT}?cell=required`);
  }

  if (hasMinPhoneDigits((row as { phone?: string | null }).phone)) return;
  redirect(`${ACCOUNT}?cell=required`);
}
