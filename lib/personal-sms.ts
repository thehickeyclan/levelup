import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

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

/** Build sms: deep link — Apple docs allow comma-separated recipients. */
export function buildPersonalGroupSmsHref(phones: string[], body: string): string | null {
  const uniq = uniqueTenDigitPhones(phones);
  if (uniq.length === 0) return null;
  const encodedBody = encodeURIComponent(body);
  if (uniq.length === 1) return `sms:${uniq[0]}?body=${encodedBody}`;
  return `sms:${uniq.join(',')}?body=${encodedBody}`;
}

/**
 * Open the device SMS app from the coach's personal number.
 * Uses comma-separated recipients in the sms: URL (works on iOS and Android).
 */
export function openPersonalGroupSms(options: {
  /** Raw list from sms-phones API (CRLF or comma-separated). */
  pasteList: string;
  body: string;
  recipientLabel?: string;
}): void {
  if (typeof window === 'undefined') return;

  const pasteList = options.pasteList.trim();
  if (!pasteList) {
    window.alert('No phone numbers on file.');
    return;
  }

  const uniq = phonesFromPasteList(pasteList);
  if (uniq.length === 0) {
    window.alert('No valid numbers on file.');
    return;
  }

  const href = buildPersonalGroupSmsHref(uniq, options.body);
  if (!href) {
    window.alert('No valid numbers on file.');
    return;
  }

  // Best-effort clipboard backup (sync path inside — do not await before navigation).
  void copyTextToClipboard(uniq.join(', '));

  window.location.href = href;
}
