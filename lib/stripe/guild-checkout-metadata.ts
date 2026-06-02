import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';

/** RecruitNC shared-webhook classification — must stay stable. */
export const GUILD_STRIPE_CHANNEL = 'guild';
export const GUILD_STRIPE_BUSINESS = 'wrestling_guild';

export type GuildStripeCheckoutSource =
  | 'guild_booking'
  | 'guild_register'
  | 'guild_cart'
  | 'guild_credits'
  | 'guild_package';

export function formatGuildProductName(opts: {
  sessionType?: string | null;
  sessionMode?: string | null;
  durationMinutes?: number | null;
  scheduledDatetime?: string | null;
  coachName?: string | null;
  suffix?: string | null;
}): string {
  const typeLabel = getSessionTypeDisplay(opts.sessionType, opts.sessionMode).label;
  const dur = opts.durationMinutes ?? 60;
  const bits: string[] = [`${typeLabel} session`, `${dur} min`];
  if (opts.scheduledDatetime) {
    const dt = new Date(opts.scheduledDatetime);
    if (!Number.isNaN(dt.getTime())) {
      bits.push(formatEST(dt, 'MMM d, h:mm a'));
    }
  }
  const coach = opts.coachName?.trim();
  if (coach) bits.push(`· ${coach}`);
  const suffix = opts.suffix?.trim();
  if (suffix) bits.push(suffix);
  return bits.join(' ').slice(0, 500);
}

export type BuildGuildCheckoutMetadataInput = {
  source: GuildStripeCheckoutSource;
  tenantSlug: string;
  parentId: string;
  productName: string;
  parentEmail?: string | null;
  athleteName?: string | null;
  /** Guild session / booking row id (also written as session_id for legacy webhook). */
  bookingId?: string | null;
  /** Operational keys for www.wrestlingguild.com/api/stripe/webhook (booking_lines, register, cart, etc.). */
  extras?: Record<string, string>;
};

/** Stripe Checkout Session + PaymentIntent metadata for Guild payments (RecruitNC-safe). */
export function buildGuildCheckoutMetadata(input: BuildGuildCheckoutMetadataInput): Record<string, string> {
  const bookingId = input.bookingId?.trim() ?? '';
  const meta: Record<string, string> = {
    channel: GUILD_STRIPE_CHANNEL,
    business: GUILD_STRIPE_BUSINESS,
    source: input.source,
    app: 'the-guild',
    tenant_slug: input.tenantSlug,
    parent_id: input.parentId,
    product_name: input.productName.slice(0, 500),
  };

  if (bookingId) {
    meta.booking_id = bookingId;
    meta.guild_booking_id = bookingId;
    meta.session_id = bookingId;
  }

  const email = input.parentEmail?.trim();
  if (email) meta.parent_email = email.slice(0, 500);

  const athlete = input.athleteName?.trim();
  if (athlete) meta.athlete_name = athlete.slice(0, 500);

  if (input.extras) {
    for (const [key, value] of Object.entries(input.extras)) {
      if (value == null || value === '') continue;
      meta[key] = String(value).slice(0, 500);
    }
  }

  return meta;
}

export function guildPaymentIntentData(
  metadata: Record<string, string>
): { metadata: Record<string, string> } {
  return { metadata: { ...metadata } };
}

/** True when this Checkout Session is a deferred book-a-coach payment (roster after pay). */
export function isGuildDeferredBookingCheckout(metadata: StripeLikeMetadata | null | undefined): boolean {
  if (!metadata) return false;
  const lines = metadata.booking_lines?.trim();
  if (!lines) return false;
  const source = metadata.source ?? '';
  if (source.startsWith('guild_booking')) return true;
  const ch = metadata.channel ?? '';
  return ch === GUILD_STRIPE_CHANNEL || ch === 'bookings';
}

type StripeLikeMetadata = {
  booking_lines?: string | null;
  source?: string | null;
  channel?: string | null;
};
