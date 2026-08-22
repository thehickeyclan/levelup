import type { TenantConfig } from '@/config/tenants';
import { sendTransactionalEmail } from '@/lib/email/send-transactional';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Where admins receive new coach application alerts. */
export function getCoachApplicationsNotifyEmail(tenant: TenantConfig): string {
  const fromEnv = process.env.COACH_APPLICATIONS_NOTIFY_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  return tenant.supportEmail;
}

export async function sendCoachApplicationSubmittedToCoach(params: {
  to: string;
  firstName: string;
  tenant: TenantConfig;
  baseUrl: string;
}) {
  const { to, firstName, tenant, baseUrl } = params;
  const name = escapeHtml(firstName.trim() || 'there');
  const product = escapeHtml(tenant.productName);
  const pendingUrl = `${baseUrl.replace(/\/$/, '')}/coach-pending?submitted=1`;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;">
  <p>Hi ${name},</p>
  <p>Your ${product} coach account is created. You can begin building your business profile now.</p>
  <p>We’ll verify your identity and any credentials you submitted, typically within 24–48 hours. Verification enables paid family bookings.</p>
  <p>Sign in to continue setup: <a href="${escapeHtml(pendingUrl)}">${escapeHtml(pendingUrl)}</a></p>
  <p>If you have questions, reply to this email or write to ${escapeHtml(tenant.supportEmail)}.</p>
  <p>— ${product}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Your ${tenant.productName} coach account is created. Build your profile now while we verify your identity and credentials (typically within 24-48 hours).`,
    '',
    `Continue setup: ${pendingUrl}`,
    '',
    `Questions: ${tenant.supportEmail}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `Your ${tenant.productName} coach account is ready`,
    html,
    text,
    replyTo: tenant.supportEmail,
  });
}

export async function sendCoachApplicationSubmittedToAdmin(params: {
  adminEmail: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  tenant: TenantConfig;
  baseUrl: string;
}) {
  const { adminEmail, applicantFirstName, applicantLastName, applicantEmail, tenant, baseUrl } = params;
  const fullName = `${applicantFirstName} ${applicantLastName}`.trim();
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin/coach-applications`;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;">
  <p>New coach signup on ${escapeHtml(tenant.productName)}.</p>
  <p><strong>${escapeHtml(fullName)}</strong><br />
  ${escapeHtml(applicantEmail)}</p>
  <p><a href="${escapeHtml(adminUrl)}">Review in admin →</a></p>
</body></html>
`.trim();

  const text = [
    `New coach signup — ${tenant.productName}`,
    '',
    `${fullName}`,
    applicantEmail,
    '',
    `Review: ${adminUrl}`,
  ].join('\n');

  return sendTransactionalEmail({
    to: adminEmail,
    subject: `[${tenant.productName}] Verify new coach: ${fullName}`,
    html,
    text,
    replyTo: applicantEmail,
  });
}

export async function sendCoachApplicationApproved(params: {
  to: string;
  firstName: string;
  tenant: TenantConfig;
  baseUrl: string;
}) {
  const { to, firstName, tenant, baseUrl } = params;
  const name = escapeHtml(firstName.trim() || 'there');
  const dashboardUrl = `${baseUrl.replace(/\/$/, '')}/coach-welcome`;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;">
  <p>Hi ${name},</p>
  <p>Great news — your ${escapeHtml(tenant.productName)} coach account has been <strong>verified</strong> and paid bookings are enabled.</p>
  <p>Sign in to finish setup and start coaching: <a href="${escapeHtml(dashboardUrl)}">${escapeHtml(dashboardUrl)}</a></p>
  <p>— ${escapeHtml(tenant.productName)}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Your ${tenant.productName} coach account is verified and paid bookings are enabled.`,
    '',
    `Go to your welcome checklist: ${dashboardUrl}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `You're verified — ${tenant.productName} coach`,
    html,
    text,
    replyTo: tenant.supportEmail,
  });
}

export async function sendCoachApplicationRejected(params: {
  to: string;
  firstName: string;
  reason: string;
  tenant: TenantConfig;
}) {
  const { to, firstName, reason, tenant } = params;
  const name = escapeHtml(firstName.trim() || 'there');
  const safeReason = escapeHtml(reason.trim());

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;">
  <p>Hi ${name},</p>
  <p>Thank you for creating a coach account with ${escapeHtml(tenant.productName)}. We’re not able to verify it for paid bookings at this time.</p>
  <p><strong>Note from the team:</strong><br />${safeReason.replace(/\n/g, '<br />')}</p>
  <p>If you have questions, contact ${escapeHtml(tenant.supportEmail)}.</p>
  <p>— ${escapeHtml(tenant.productName)}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `We’re not able to verify your ${tenant.productName} coach account for paid bookings at this time.`,
    '',
    `Note: ${reason.trim()}`,
    '',
    `Questions: ${tenant.supportEmail}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `Update on your ${tenant.productName} coach verification`,
    html,
    text,
    replyTo: tenant.supportEmail,
  });
}
