/**
 * Filing check — standards §1.6: the platform's photo-match decides what a
 * shoe is, not the seller's title.
 *
 * Two layers, deliberately separate:
 *  - classifyListingFiling is deterministic catalog-name resolution. It only
 *    ever matches a filed name EXACTLY against a catalog model or alias —
 *    no containment, no fuzz. "Combat Speed (Vintage West Germany)" stays
 *    unfiled rather than guessing a generation, and an alias that lives on
 *    two rows (eBay's "Asics Dave Schultz" problem) is declared ambiguous,
 *    never picked.
 *  - comparePhotoIdentification judges an AI photo-ID against the filing.
 *    Catalog row identity is the comparison where it exists; names alone
 *    can confirm a match but never condemn one.
 */

export type FilingCandidate = { brand: string; model: string };

export type FilingClassification =
  | { status: 'canonical' }
  | { status: 'legacy_alias'; refileTo: FilingCandidate }
  | { status: 'ambiguous_alias'; candidates: FilingCandidate[] }
  | { status: 'unfiled' };

type CatalogNameRow = {
  brand: string;
  model: string;
  model_aliases?: string[] | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Brands that say "we don't know" rather than naming a maker. */
const GENERIC_BRANDS = new Set(['', 'other', 'unknown', 'misc', 'vintage']);

export function classifyListingFiling(
  filedBrand: string | null | undefined,
  filedModel: string | null | undefined,
  catalog: CatalogNameRow[]
): FilingClassification {
  const nb = norm(filedBrand);
  const nm = norm(filedModel);
  if (!nm) return { status: 'unfiled' };

  const matches: { row: CatalogNameRow; viaModel: boolean }[] = [];
  for (const row of catalog) {
    const viaModel = norm(row.model) === nm;
    const viaAlias =
      !viaModel && (row.model_aliases ?? []).some((a) => norm(a) === nm);
    if (viaModel || viaAlias) matches.push({ row, viaModel });
  }
  if (!matches.length) return { status: 'unfiled' };

  // Same-named models across brands (Cronin remade the Combat Speed): the
  // filed brand decides — unless it is a generic placeholder.
  const brandMatches = matches.filter((m) => norm(m.row.brand) === nb);
  const pool = brandMatches.length ? brandMatches : matches;

  if (!brandMatches.length && !GENERIC_BRANDS.has(nb)) {
    // The filed brand is a real brand that owns none of the matching rows —
    // "Adidas Rulon" is a conflict a human resolves, not a refile.
    return {
      status: 'ambiguous_alias',
      candidates: pool.map((m) => ({ brand: m.row.brand, model: m.row.model })),
    };
  }

  if (pool.length > 1) {
    return {
      status: 'ambiguous_alias',
      candidates: pool.map((m) => ({ brand: m.row.brand, model: m.row.model })),
    };
  }

  const hit = pool[0]!;
  if (hit.viaModel && norm(hit.row.brand) === nb) return { status: 'canonical' };
  return {
    status: 'legacy_alias',
    refileTo: { brand: hit.row.brand, model: hit.row.model },
  };
}

export type PhotoComparison = {
  verdict: 'agrees' | 'disagrees' | 'inconclusive';
  note: string;
};

export const PHOTO_CHECK_MIN_CONFIDENCE = 0.55;

export function comparePhotoIdentification(input: {
  filed: FilingCandidate;
  filedCatalogId: string | null;
  photo: FilingCandidate & { confidence: number };
  photoCatalogId: string | null;
  minConfidence?: number;
}): PhotoComparison {
  const min = input.minConfidence ?? PHOTO_CHECK_MIN_CONFIDENCE;
  if (input.photo.confidence < min) {
    return {
      verdict: 'inconclusive',
      note: `Photo ID confidence ${Math.round(input.photo.confidence * 100)}% is below the ${Math.round(min * 100)}% bar — not evidence either way.`,
    };
  }

  const sameName =
    norm(input.filed.brand) === norm(input.photo.brand) &&
    norm(input.filed.model) === norm(input.photo.model);

  if (input.filedCatalogId && input.photoCatalogId) {
    if (input.filedCatalogId === input.photoCatalogId) {
      return { verdict: 'agrees', note: 'Photos match the filed catalog model.' };
    }
    return {
      verdict: 'disagrees',
      note: `Photos identify ${input.photo.brand} ${input.photo.model} — a different catalog model than the filing.`,
    };
  }

  if (sameName) {
    return { verdict: 'agrees', note: 'Photo ID names the filed model.' };
  }
  if (input.photoCatalogId) {
    // The photo resolved to a catalog row the filing couldn't — the usual
    // shape of a misfiled or legacy-named listing.
    return {
      verdict: 'disagrees',
      note: `Photos identify ${input.photo.brand} ${input.photo.model} (in the catalog); the filed name matches nothing.`,
    };
  }
  // Two names, neither anchored to the catalog — a disagreement between
  // guesses is not a finding.
  return {
    verdict: 'inconclusive',
    note: `Photo ID says ${input.photo.brand} ${input.photo.model}, but neither name is in the catalog — needs a human read.`,
  };
}
