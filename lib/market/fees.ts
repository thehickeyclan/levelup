/** Platform fee on item price only — never on shipping. Seller pays via payout deduction. */

export function getMarketFeeRate(priceCents: number): number {
  if (priceCents < 10000) return 0.1;
  if (priceCents < 20000) return 0.08;
  if (priceCents < 40000) return 0.07;
  return 0.06;
}

export function calcMarketFees(priceCents: number) {
  const rate = getMarketFeeRate(priceCents);
  const feeCents = Math.round(priceCents * rate);
  return { feeCents, payoutCents: priceCents - feeCents, rate };
}

export const MARKET_TRADE_FEE_CENTS = 499;
