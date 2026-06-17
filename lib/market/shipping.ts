export type MarketShippingCarrier = 'usps' | 'ups' | 'fedex' | 'other';

export const SHIPPING_CARRIERS: readonly { value: MarketShippingCarrier; label: string }[] = [
  { value: 'usps', label: 'USPS' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'other', label: 'Other' },
];

export function normalizeCarrier(raw: string | null | undefined): MarketShippingCarrier {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'usps' || s.includes('postal') || s.includes('post office')) return 'usps';
  if (s === 'ups') return 'ups';
  if (s === 'fedex' || s.includes('federal express')) return 'fedex';
  return 'other';
}

/** Strip spaces/dashes for carrier lookup URLs where needed. */
export function cleanTrackingNumber(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

export function trackingUrl(carrier: MarketShippingCarrier, trackingNumber: string): string | null {
  const n = cleanTrackingNumber(trackingNumber);
  if (!n) return null;
  switch (carrier) {
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`;
    case 'ups':
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`;
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`;
    default:
      return null;
  }
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Awaiting payment';
    case 'paid':
      return 'Paid — ship soon';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'completed':
      return 'Completed';
    case 'disputed':
      return 'Disputed';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status.replace(/_/g, ' ');
  }
}

export type ShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export function formatShippingAddress(addr: ShippingAddress | null | undefined): string {
  if (!addr) return 'No address on file';
  const lines = [
    addr.name,
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
  ].filter(Boolean);
  return lines.join('\n');
}
