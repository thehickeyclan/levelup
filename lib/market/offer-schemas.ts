import { z } from 'zod';

const uuid = z.string().uuid();

export const marketOfferPostSchema = z
  .object({
    listingId: uuid,
    offerType: z.enum(['cash', 'trade', 'cash_and_trade']),
    amountCents: z.number().int().positive().optional(),
    tradeListingId: uuid.optional(),
    message: z.string().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.offerType === 'cash' || data.offerType === 'cash_and_trade') {
      if (!data.amountCents || data.amountCents < 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid offer amount (minimum $1)',
          path: ['amountCents'],
        });
      }
    }
    if (data.offerType === 'trade' || data.offerType === 'cash_and_trade') {
      if (!data.tradeListingId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a listing to trade',
          path: ['tradeListingId'],
        });
      }
    }
  });

export type MarketOfferPostInput = z.infer<typeof marketOfferPostSchema>;
