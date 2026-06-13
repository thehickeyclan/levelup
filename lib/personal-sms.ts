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

export function isIosSmsDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Clipboard text for Messages "To" field.
 * iPhone: comma-separated 10-digit numbers (line breaks often paste as one blob).
 * Mac/desktop: CRLF-separated lines.
 */
export function buildMessagesPasteList(phones: string[], opts?: { ios?: boolean }): string {
  const uniq = uniqueTenDigitPhones(phones);
  const ios = opts?.ios ?? isIosSmsDevice();
  return ios ? uniq.join(',') : uniq.join('\r\n');
}

/** Single-recipient sms: link. */
export function buildSingleSmsHref(phone10: string, body: string): string {
  return `sms:${phone10}?body=${encodeURIComponent(body)}`;
}

/** Compose-only link (no To field) — body prefilled after coach pastes numbers. */
export function buildComposeOnlySmsHref(body: string): string {
  return `sms:?body=${encodeURIComponent(body)}`;
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

  const pasteList = buildMessagesPasteList(uniq);
  return {
    mode: 'paste',
    pasteList,
    body,
    count: uniq.length,
    href: buildComposeOnlySmsHref(body),
  };
}

/** Open sms: URI — anchor click is more reliable than location.href on iOS Safari/PWA. */
export function openSmsHref(href: string): void {
  if (typeof window === 'undefined' || !href) return;
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Open SMS for a single recipient immediately. */
export function openSinglePersonalSms(phone10: string, body: string): void {
  openSmsHref(buildSingleSmsHref(phone10, body));
}

/**
 * Copy numbers and open Messages with body prefilled.
 * Must run directly inside a click handler (sync copy before navigation).
 */
export function openPasteGroupSms(plan: Extract<GroupSmsPlan, { mode: 'paste' }>): boolean {
  if (typeof window === 'undefined') return false;
  const copied = copyTextToClipboardSync(plan.pasteList);
  openSmsHref(plan.href);
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
    openSmsHref(plan.href);
    return;
  }
  openPasteGroupSms(plan);
}
