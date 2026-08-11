/**
 * Platform fee on item price only — never on shipping. Seller pays via payout deduction.
 *
 * Strategy: Guild Market should stay at least 20% cheaper than an eBay-style
 * seller take rate on every sale. Trade fees are where we can monetize more
 * aggressively without making sellers feel taxed like a generic marketplace.
 */

export const MARKET_EBAY_STYLE_SELLER_FEE_RATE = 0.1325;
export const MARKET_EBAY_DISCOUNT_TARGET = 0.2;
export const MARKET_MAX_SELLER_FEE_RATE =
  MARKET_EBAY_STYLE_SELLER_FEE_RATE * (1 - MARKET_EBAY_DISCOUNT_TARGET);

export function getMarketFeeRate(priceCents: number): number {
  const rate =
    priceCents < 10000
      ? 0.1
      : priceCents < 20000
        ? 0.08
        : priceCents < 40000
          ? 0.07
          : 0.06;

  return Math.min(rate, MARKET_MAX_SELLER_FEE_RATE);
}

export function calcMarketFees(priceCents: number) {
  const rate = getMarketFeeRate(priceCents);
  const feeCents = Math.round(priceCents * rate);
  return { feeCents, payoutCents: priceCents - feeCents, rate };
}

export const MARKET_TRADE_FEE_CENTS = 499;
export const MARKET_TRADE_BOOT_FEE_RATE = 0.03;

export function calcMarketTradeFees({
  bootAmountCents,
  paysBootFee,
}: {
  bootAmountCents?: number | null;
  paysBootFee: boolean;
}) {
  const normalizedBootCents = Math.max(0, Number(bootAmountCents ?? 0));
  const bootFeeCents = paysBootFee
    ? Math.round(normalizedBootCents * MARKET_TRADE_BOOT_FEE_RATE)
    : 0;

  return {
    baseFeeCents: MARKET_TRADE_FEE_CENTS,
    bootFeeCents,
    totalFeeCents: MARKET_TRADE_FEE_CENTS + bootFeeCents,
    bootFeeRate: MARKET_TRADE_BOOT_FEE_RATE,
  };
}
