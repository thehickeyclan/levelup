import { copyTextToClipboardSync } from '@/lib/copy-to-clipboard';

/** Normalize to 10-digit US numbers for sms: URLs and dedupe. */
export function uniqueTenDigitPhones(phones: string[]): string[] {
  const uniq: string[] = [];
  for (const raw of phones) {
    const d = raw.replace(/\D/g, '');
    const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
    if (ten.length === 10 && !uniq.includes(ten)) uniq.push(ten);
  }
  return uniq;
}

/** Parse newline- or comma-separated paste from sms-phones API. */
export function phonesFromPasteList(pasteList: string): string[] {
  const trimmed = pasteList.trim();
  if (!trimmed) return [];
  const parts =
    trimmed.includes('\n') || trimmed.includes('\r')
      ? trimmed.split(/\r?\n/)
      : trimmed.split(/[,;]+/);
  return uniqueTenDigitPhones(parts);
}

/** CRLF list for pasting into iOS Messages "To" (one number per line). */
export function buildMessagesPasteList(phones: string[]): string {
  return uniqueTenDigitPhones(phones).join('\r\n');
}

/** Single-recipient sms: link. */
export function buildSingleSmsHref(phone10: string, body: string): string {
  return `sms:${phone10}?body=${encodeURIComponent(body)}`;
}

/** Compose-only link (no To field) — used after copying numbers on iOS. */
export function buildComposeOnlySmsHref(body: string): string {
  return `sms:&body=${encodeURIComponent(body)}`;
}

export type GroupSmsPlan =
  | { mode: 'single'; href: string; count: 1 }
  | { mode: 'paste'; pasteList: string; body: string; count: number; href: string };

export function planPersonalGroupSms(options: {
  pasteList: string;
  body: string;
}): GroupSmsPlan | null {
  const uniq = phonesFromPasteList(options.pasteList);
  if (uniq.length === 0) return null;

  const body = options.body;
  if (uniq.length === 1) {
    return { mode: 'single', href: buildSingleSmsHref(uniq[0], body), count: 1 };
  }

  // iOS (and many mobile browsers) only honor the first number in sms:a,b,c — paste is required.
  const pasteList = buildMessagesPasteList(uniq);
  return {
    mode: 'paste',
    pasteList,
    body,
    count: uniq.length,
    href: buildComposeOnlySmsHref(body),
  };
}

/** Open SMS for a single recipient immediately. */
export function openSinglePersonalSms(phone10: string, body: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = buildSingleSmsHref(phone10, body);
}

/**
 * Copy numbers and open Messages with body prefilled.
 * Must run directly inside a click handler (sync copy before navigation).
 */
export function openPasteGroupSms(plan: Extract<GroupSmsPlan, { mode: 'paste' }>): boolean {
  if (typeof window === 'undefined') return false;
  const copied = copyTextToClipboardSync(plan.pasteList);
  window.location.href = plan.href;
  return copied;
}

/** @deprecated Use planPersonalGroupSms + dialog for groups. */
export function openPersonalGroupSms(options: {
  pasteList: string;
  body: string;
  recipientLabel?: string;
}): void {
  const plan = planPersonalGroupSms(options);
  if (!plan) {
    window.alert('No valid numbers on file.');
    return;
  }
  if (plan.mode === 'single') {
    window.location.href = plan.href;
    return;
  }
  openPasteGroupSms(plan);
}
