import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
}

export async function GET(req: NextRequest) {
  try {
    const hostname = resolveHostnameFromHeaders(req.headers);
    const tenant = getTenantByDomain(hostname);

    if (!tenant) {
      return NextResponse.redirect(new URL('/login?error=unknown_site', req.url));
    }

    const supabase = await createClient(tenant.slug);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(new URL('/login?error=auth_failed', req.url));
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    if (code) {
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    const adminEmails = getAdminEmails();
    const emailLower = (user.email ?? '').toLowerCase();
    if (adminEmails.has(emailLower)) {
      try {
        const admin = createAdminClient(tenant.slug);
        await admin.from('users').update({ role: 'admin' }).eq('id', user.id);
      } catch {
        /* ignore */
      }
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = userData?.role || 'parent';
    const redirectPath = 
      role === 'coach' ? '/athlete-dashboard' :
      role === 'youth_wrestler' ? '/training' :
      '/dashboard';
    // Admins land on product (/dashboard); use Admin nav link to switch to admin.

    return NextResponse.redirect(new URL(redirectPath, req.url));
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(new URL('/login?error=callback_failed', req.url));
  }
}
