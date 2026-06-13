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

/**
 * Open the device SMS app from the coach's personal number.
 * iOS ignores extra recipients in sms: URLs — for 2+, copy numbers and open compose with body only.
 */
export async function openPersonalGroupSms(options: {
  /** Raw multiline list from sms-phones API (CRLF preferred). */
  pasteList: string;
  body: string;
  recipientLabel?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const pasteList = options.pasteList.trim();
  if (!pasteList) {
    window.alert('No phone numbers on file.');
    return;
  }

  const uniq = uniqueTenDigitPhones(pasteList.split(/\r?\n/));
  if (uniq.length === 0) {
    window.alert('No valid numbers on file.');
    return;
  }

  const encodedBody = encodeURIComponent(options.body);
  const who = options.recipientLabel ?? 'recipient';

  if (uniq.length === 1) {
    window.location.href = `sms:${uniq[0]}?body=${encodedBody}`;
    return;
  }

  const copied = await copyTextToClipboard(pasteList);
  const hint = copied
    ? `${uniq.length} ${who} numbers copied. Tap OK to open Messages — paste into To, then send.`
    : `Paste these numbers into Messages To (one per line), then send:\n\n${pasteList}`;

  if (!window.confirm(hint)) return;
  window.location.href = `sms:?&body=${encodedBody}`;
}
