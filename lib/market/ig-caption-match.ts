/**
 * Match free-text Instagram listing captions ("Adidas OG Combat Speed 4
 * Red/Black", "ASICS Medalists (2000)") to catalog models.
 *
 * Matching reuses the catalog's own model + alias names — never a fresh
 * regex per shoe. Rules:
 * - Candidate names are token sequences; a caption matches when the tokens
 *   appear consecutively (plural-tolerant on each token: "Medalists" matches
 *   "Medalist"). Multi-token names also get a collapsed single-token variant
 *   ("EX-EO" matches caption word "EXEO").
 * - Longest name wins, so "Combat Speed 4" beats "Combat Speed".
 * - Sibling guard: if the token right after the matched span is a small
 *   number or roman numeral that is not part of the match, the caption names
 *   a numbered sibling we did not match — drop it rather than mis-bucket.
 * - Brand guard: if the caption names a brand, only that brand's models are
 *   eligible ("Cronin Combat Speed" never lands on the Adidas row).
 * - A tie between two different catalog rows is ambiguous — drop.
 */

export type CatalogNameRow = {
  id: string;
  brand: string;
  model: string;
  model_aliases?: string[] | null;
};

type Candidate = {
  row: CatalogNameRow;
  name: string;
  tokens: string[];
};

export type CaptionIndex = {
  candidates: Candidate[];
  brandTokens: Map<string, string>; // caption token -> canonical brand (lowercase)
};

export const captionTokens = (s: string): string[] =>
  s
    .replace(/(\d)\.0\b/g, '$1') // "Cael V3.0" tokenizes as "cael v3", not "cael v3 0"
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);

const BRAND_TOKEN_SYNONYMS: Record<string, string[]> = {
  'funky flickr boyz': ['ffb', 'ffbs'],
  nidrogen: [],
  asics: [],
  adidas: [],
  nike: [],
  scraplife: ['scraplife'],
};

function tokenEq(cap: string, cand: string): boolean {
  return cap === cand || cap === `${cand}s`;
}

export function buildCaptionIndex(
  rows: CatalogNameRow[],
  extraAliases: Record<string, { brand: string; model: string }> = {}
): CaptionIndex {
  const candidates: Candidate[] = [];
  const brandTokens = new Map<string, string>();
  const byBrandModel = new Map<string, CatalogNameRow>();

  for (const row of rows) {
    byBrandModel.set(`${row.brand.toLowerCase()}|${row.model.toLowerCase()}`, row);
    const brandKey = row.brand.toLowerCase();
    for (const t of captionTokens(row.brand)) brandTokens.set(t, brandKey);
    for (const syn of BRAND_TOKEN_SYNONYMS[brandKey] ?? []) brandTokens.set(syn, brandKey);

    const names = [row.model, ...(row.model_aliases ?? [])];
    for (const name of names) {
      const tokens = captionTokens(name);
      if (!tokens.length) continue;
      candidates.push({ row, name, tokens });
      if (tokens.length > 1) {
        // Collapsed variant: "ex eo" also matches the single caption word "exeo".
        candidates.push({ row, name, tokens: [tokens.join('')] });
      }
    }
  }

  for (const [alias, target] of Object.entries(extraAliases)) {
    const row = byBrandModel.get(`${target.brand.toLowerCase()}|${target.model.toLowerCase()}`);
    if (!row) continue;
    const tokens = captionTokens(alias);
    if (!tokens.length) continue;
    candidates.push({ row, name: alias, tokens });
    if (tokens.length > 1) candidates.push({ row, name: alias, tokens: [tokens.join('')] });
  }

  return { candidates, brandTokens };
}

export type CaptionMatch = { row: CatalogNameRow; name: string };

export function matchCaption(caption: string, index: CaptionIndex): CaptionMatch | null {
  const toks = captionTokens(caption);
  if (!toks.length) return null;

  const brandsInCaption = new Set<string>();
  for (const t of toks) {
    const b = index.brandTokens.get(t);
    if (b) brandsInCaption.add(b);
  }

  let best: { cand: Candidate; len: number }[] = [];
  for (const cand of index.candidates) {
    if (brandsInCaption.size && !brandsInCaption.has(cand.row.brand.toLowerCase())) continue;
    for (let i = 0; i + cand.tokens.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < cand.tokens.length; j++) {
        if (!tokenEq(toks[i + j], cand.tokens[j])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Sibling guard: "<model> 5" when we only matched "<model>". Only when
      // the candidate does NOT already end in a generation marker — otherwise
      // a price token right after ("Combat Speed 5s - $88") kills a correct
      // match and lets a shorter alias steal the caption.
      const lastCand = cand.tokens[cand.tokens.length - 1];
      const candEndsInGeneration = /^v?\d{1,2}$/.test(lastCand) || ROMAN.has(lastCand);
      const next = toks[i + cand.tokens.length];
      if (!candEndsInGeneration && next && (/^\d{1,2}s?$/.test(next) || ROMAN.has(next))) continue;
      const len = cand.tokens.join(' ').length;
      best.push({ cand, len });
      break; // one hit per candidate is enough
    }
  }

  if (!best.length) return null;
  best.sort((a, b) => b.len - a.len);
  const top = best.filter((b) => b.len === best[0].len);
  const rowIds = new Set(top.map((b) => b.cand.row.id));
  if (rowIds.size > 1) return null; // ambiguous across catalog rows
  return { row: top[0].cand.row, name: top[0].cand.name };
}
