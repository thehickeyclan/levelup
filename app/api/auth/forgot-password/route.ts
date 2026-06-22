import { NextRequest, NextResponse } from 'next/server';
import { getTenantByDomain } from '@/config/tenants';
import { sendPasswordRecoveryEmail } from '@/lib/auth/send-password-recovery';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const hostname = req.headers.get('host') || '';
    const tenant = getTenantByDomain(hostname);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const result = await sendPasswordRecoveryEmail(req, tenant.slug, email);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      ...(result.dev_reset_url ? { dev_reset_url: result.dev_reset_url } : {}),
    });
  } catch (e) {
    console.error('[forgot-password] exception:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
