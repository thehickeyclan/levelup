import { createHmac } from 'crypto';

const SECRET = process.env.CONFIRMATION_TOKEN_SECRET || 'levelup-confirm-dev';
const TTL_SEC = 600; // 10 minutes

function sign(sessionId: string, expiryUnix: number): string {
  const payload = `${sessionId}:${expiryUnix}`;
  const hmac = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${expiryUnix}.${hmac}`;
}

/**
 * Generate a short-lived token for the register-confirmed page after Stripe redirect.
 * Expiry is bucketed to TTL_SEC windows so Stripe idempotency retries reuse the same success_url.
 */
export function createRegisterConfirmationToken(sessionId: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiryUnix = Math.floor(nowSec / TTL_SEC) * TTL_SEC + TTL_SEC;
  return sign(sessionId, expiryUnix);
}

/** Verify token for the given sessionId. Returns true if valid and not expired. */
export function verifyRegisterConfirmationToken(sessionId: string, token: string): boolean {
  if (!token || !sessionId) return false;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return false;
  const expiryUnix = parseInt(parts[0], 10);
  if (Number.isNaN(expiryUnix) || expiryUnix <= Math.floor(Date.now() / 1000)) return false;
  const expected = sign(sessionId, expiryUnix);
  return token === expected;
}
