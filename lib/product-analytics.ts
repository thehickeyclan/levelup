import { track } from '@vercel/analytics';

type ProductEventValue = string | number | boolean | null;

/** Best-effort product analytics. Tracking must never block a booking or session action. */
export function trackProductEvent(
  name: string,
  properties?: Record<string, ProductEventValue>
): void {
  try {
    track(name, properties);
  } catch {
    // Analytics is intentionally non-blocking (local development, blockers, network failures).
  }
}
