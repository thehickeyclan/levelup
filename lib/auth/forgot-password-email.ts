import { getPublicSiteUrlFromRequest } from '@/lib/public-site-url';
import type { NextRequest } from 'next/server';

export function buildPasswordRecoveryConfirmUrl(
  req: NextRequest,
  hashedToken: string
): string {
  const siteUrl = getPublicSiteUrlFromRequest(req);
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: 'recovery',
    next: '/reset-password',
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

export function passwordRecoveryEmailContent(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Reset your The Guild password';
  const text = [
    'You requested a password reset for The Guild.',
    '',
    'Open this link to choose a new password:',
    resetUrl,
    '',
    'This link expires after use. If you did not request a reset, you can ignore this email.',
    '',
    'Questions? info@WrestlingGuild.com',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
      <p>You requested a password reset for <strong>The Guild</strong>.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#b8860b;color:#fff;text-decoration:none;border-radius:9999px;font-weight:600;">Reset password</a></p>
      <p style="font-size:14px;color:#555;">If the button does not work, copy this link into your browser:</p>
      <p style="font-size:13px;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="font-size:13px;color:#555;">This link expires after use. If you did not request a reset, you can ignore this email.</p>
    </div>
  `.trim();

  return { subject, html, text };
}
