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
  <p>Thanks for applying to coach with ${product}. We received your application and will review it soon (typically within 24–48 hours).</p>
  <p>You can check your status anytime by signing in: <a href="${escapeHtml(pendingUrl)}">${escapeHtml(pendingUrl)}</a></p>
  <p>If you have questions, reply to this email or write to ${escapeHtml(tenant.supportEmail)}.</p>
  <p>— ${product}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Thanks for applying to coach with ${tenant.productName}. We received your application and will review it soon (typically within 24-48 hours).`,
    '',
    `Check status: ${pendingUrl}`,
    '',
    `Questions: ${tenant.supportEmail}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `We received your ${tenant.productName} coach application`,
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
  <p>New coach application on ${escapeHtml(tenant.productName)}.</p>
  <p><strong>${escapeHtml(fullName)}</strong><br />
  ${escapeHtml(applicantEmail)}</p>
  <p><a href="${escapeHtml(adminUrl)}">Review in admin →</a></p>
</body></html>
`.trim();

  const text = [
    `New coach application — ${tenant.productName}`,
    '',
    `${fullName}`,
    applicantEmail,
    '',
    `Review: ${adminUrl}`,
  ].join('\n');

  return sendTransactionalEmail({
    to: adminEmail,
    subject: `[${tenant.productName}] New coach application: ${fullName}`,
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
  <p>Great news — your ${escapeHtml(tenant.productName)} coach application has been <strong>approved</strong>.</p>
  <p>Sign in to finish setup and start coaching: <a href="${escapeHtml(dashboardUrl)}">${escapeHtml(dashboardUrl)}</a></p>
  <p>— ${escapeHtml(tenant.productName)}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Your ${tenant.productName} coach application has been approved.`,
    '',
    `Go to your welcome checklist: ${dashboardUrl}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `You're approved — ${tenant.productName} coach`,
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
  <p>Thank you for your interest in coaching with ${escapeHtml(tenant.productName)}. We’re not able to approve your application at this time.</p>
  <p><strong>Note from the team:</strong><br />${safeReason.replace(/\n/g, '<br />')}</p>
  <p>If you have questions, contact ${escapeHtml(tenant.supportEmail)}.</p>
  <p>— ${escapeHtml(tenant.productName)}</p>
</body></html>
`.trim();

  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Thank you for your interest in coaching with ${tenant.productName}. We're not able to approve your application at this time.`,
    '',
    `Note: ${reason.trim()}`,
    '',
    `Questions: ${tenant.supportEmail}`,
    '',
    `— ${tenant.productName}`,
  ].join('\n');

  return sendTransactionalEmail({
    to,
    subject: `Update on your ${tenant.productName} coach application`,
    html,
    text,
    replyTo: tenant.supportEmail,
  });
}
