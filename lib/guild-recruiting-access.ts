// Server-side only (next/headers): never import from client components.
import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { GUILD_RECRUITING_PUBLIC, getRecruitingState } from '@/lib/guild-recruiting';

/**
 * Who may see the hidden Guild Recruiting pages: everyone once the flag is on,
 * admins before that. Everyone else gets a 404 (callers notFound()), never a
 * redirect or teaser — the product name must stay out of public view.
 */
export async function canViewRecruitingPages(): Promise<boolean> {
  if (GUILD_RECRUITING_PUBLIC) return true;
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return false;
    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    return me?.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Factory for the flyer/QR shortcuts (/recruitnc → /recruit/nc). Temporary
 * redirect while hidden (admins only), permanent once the flag is on so
 * printed links cache correctly; 404 for everyone else.
 */
export function recruitStateShortcut(code: string) {
  return async function GET(req: NextRequest): Promise<NextResponse> {
    const state = getRecruitingState(code);
    if (!state || !(await canViewRecruitingPages())) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.redirect(
      new URL(`/recruit/${state.code}`, req.url),
      GUILD_RECRUITING_PUBLIC ? 308 : 307
    );
  };
}
