/**
 * Copy text to the clipboard.
 * Order matters: synchronous `execCommand` runs first so the copy stays within the user gesture
 * (iOS Safari often rejects `navigator.clipboard.writeText` after `await` in the same handler).
 * Then Clipboard API, then ClipboardItem, then execCommand again as last resort.
 */

function copyViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined' || !text) return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '0';
    ta.style.top = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Messages on Mac/iOS parses CRLF in the To field more reliably than LF alone. */
function normalizeClipboardText(text: string): string {
  if (!text.includes('\n') && !text.includes('\r')) return text;
  return text.replace(/\r?\n/g, '\r\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !text) return false;
  const payload = normalizeClipboardText(text);

  // 1) Sync — best chance on mobile Safari for multiline phone lists
  if (copyViaExecCommand(payload)) return true;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch {
      /* try ClipboardItem */
    }
  }

  if (window.isSecureContext && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': new Blob([payload], { type: 'text/plain' }) }),
      ]);
      return true;
    } catch {
      /* last resort */
    }
  }

  return copyViaExecCommand(payload);
}

/** Synchronous copy — required before sms: navigation on iOS (user gesture). */
export function copyTextToClipboardSync(text: string): boolean {
  if (typeof window === 'undefined' || !text) return false;
  const payload = normalizeClipboardText(text);
  if (copyViaExecCommand(payload)) return true;

  // iOS Safari sometimes rejects hidden textarea; contentEditable fallback.
  try {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = payload;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges();
    document.body.removeChild(el);
    if (ok) return true;
  } catch {
    /* fall through */
  }

  return copyViaExecCommand(payload);
}
