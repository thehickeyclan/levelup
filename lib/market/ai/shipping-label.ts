import { z } from 'zod';
import { normalizeCarrier, type MarketShippingCarrier } from '@/lib/market/shipping';

export const SHIPPING_LABEL_SYSTEM_PROMPT = `You read shipping labels and receipts for The Guild Market.
Extract the shipment tracking number and carrier from the image.

Rules:
- USPS tracking is often 20–22 digits, sometimes starting with 9.
- UPS tracking is often 1Z followed by 16 characters.
- FedEx is often 12–15 digits.
- Return the tracking number exactly as printed (spaces ok — we normalize later).
- carrier must be one of: usps, ups, fedex, other
- confidence: high if clear barcode area or tracking line, medium if partially visible, low if guessing
- If multiple numbers appear, pick the primary shipment tracking number.

Return ONLY valid JSON: tracking_number, carrier, confidence (high|medium|low), note.`;

export const ShippingLabelScanSchema = z.object({
  tracking_number: z.string().min(6),
  carrier: z.enum(['usps', 'ups', 'fedex', 'other']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  note: z.string().optional(),
});

export type ShippingLabelScan = {
  tracking_number: string;
  carrier: MarketShippingCarrier;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
};

export function parseShippingLabelScan(raw: unknown): ShippingLabelScan | null {
  try {
    const parsed = ShippingLabelScanSchema.parse(raw);
    return {
      tracking_number: parsed.tracking_number.trim(),
      carrier: normalizeCarrier(parsed.carrier),
      confidence: parsed.confidence ?? 'medium',
      note: parsed.note,
    };
  } catch {
    return null;
  }
}
