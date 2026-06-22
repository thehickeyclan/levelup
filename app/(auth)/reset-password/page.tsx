import { headers } from 'next/headers';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './reset-password-form';
import { ResetPasswordInvalid } from './reset-password-invalid';
import { ResetPasswordClientBridge } from './reset-password-client-bridge';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const params = await searchParams;
  const hostname = resolveHostnameFromHeaders(await headers());
  const tenant = getTenantByDomain(hostname);

  if (!tenant) {
    return <ResetPasswordInvalid errorKey="invalid_link" />;
  }

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return <ResetPasswordForm />;
  }

  if (params.error) {
    return <ResetPasswordInvalid errorKey={params.error} />;
  }

  // Legacy hash tokens or PKCE code — client must establish session.
  return <ResetPasswordClientBridge />;
}
