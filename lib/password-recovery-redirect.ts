/**
 * redirectTo for Supabase resetPasswordForEmail — must be called from the **browser**
 * so PKCE code_verifier is stored on this origin when PKCE fallback is used.
 *
 * Primary recovery lands on /auth/confirm (server verifyOtp or code exchange), then
 * redirects to /reset-password with a session cookie — works across email apps when
 * the Supabase recovery email template uses TokenHash (see supabase/scripts/).
 */
export function getPasswordRecoveryRedirectTo(): string {
  const next = encodeURIComponent('/reset-password');

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/confirm?next=${next}`;
  }

  const explicit =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, '')
      : '';
  if (explicit) return `${explicit}/auth/confirm?next=${next}`;
  return `/auth/confirm?next=${next}`;
}

export const PASSWORD_RESET_ERROR_MESSAGES: Record<string, string> = {
  pkce_browser:
    'This link must open in the same browser where you requested the reset (Safari vs Gmail in-app are different). Copy the link from your email and paste it into that browser, or request a new link and open it there.',
  verify_failed:
    'This reset link is invalid or already used. Request a new one below.',
  exchange_failed:
    'Could not verify this reset link. It may have expired — request a new one.',
  missing_token:
    'This reset link is incomplete. Request a new one from Forgot password.',
  invalid_link:
    'This reset link is invalid or expired. Request a new one below.',
};
