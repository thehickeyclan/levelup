/**
 * Instagram resale ledger (2018–2026) as a labeled secondary pricing signal.
 *
 * Data is a build artifact of scripts/build-ig-price-history.ts over Muse's
 * pulls of the two largest IG resale accounts (~9,000 posts). These are
 * listed/asking prices — per the standing rule they are a cross-check, never
 * comps: Guild sales and eBay sold comps govern. The signal earns its keep on
 * grails and thin models where the eBay 90-day window holds 0–3 sales.
 */
import igData from './data/ig-price-history.json';

export type IgModelHistory = {
  brand: string;
  model: string;
  posts: number;
  priced: number;
  sold_priced: number;
  median_usd: number | null;
  median_recent_24mo_usd: number | null;
  min_usd: number | null;
  max_usd: number | null;
  first_date: string | null;
  last_date: string | null;
  latest: { date: string; price_usd: number; status: string }[];
};

const data = igData as unknown as {
  models: Record<string, IgModelHistory>;
  alias_keys: Record<string, string>;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function getIgPriceHistory(
  brand: string | null | undefined,
  model: string | null | undefined
): IgModelHistory | null {
  const key = `${norm(brand)}|${norm(model)}`;
  return data.models[key] ?? data.models[data.alias_keys[key]] ?? null;
}

/** Prompt lines for the pricing AI; empty when we have no ledger for the model. */
export function igHistoryPromptLines(h: IgModelHistory | null): string[] {
  if (!h || !h.priced || h.median_usd == null) return [];
  const span = [h.first_date?.slice(0, 4), h.last_date?.slice(0, 4)]
    .filter(Boolean)
    .join('–');
  const lines = [
    `Instagram resale ledger ${span} (secondary signal — listed/asking prices from the two largest IG resale accounts; Guild sales and eBay sold comps govern): ` +
      `${h.priced} priced posts of ${h.posts} total, median $${h.median_usd}` +
      (h.median_recent_24mo_usd != null ? `, last-24-month median $${h.median_recent_24mo_usd}` : '') +
      `, range $${h.min_usd}–$${h.max_usd}.`,
  ];
  if (h.latest.length) {
    lines.push(
      `Most recent IG posts: ${h.latest
        .map((p) => `$${p.price_usd} (${p.status}, ${p.date})`)
        .join(', ')}.`
    );
  }
  return lines;
}
