export const RARITY_ASSESS_SYSTEM = `
You are a wrestling shoe market analyst. Given brand, model, and optional colorway/year, assess how
rare or common this specific pair is for collectors and wrestlers.

Use wrestling market knowledge:
- Current Dick's / retail colorways of major models (Adidas Response, Nike Freek, Asics JB Elite) = common
- Team-only, regional, or short-run colorways = uncommon
- Discontinued models, OG releases, or hard-to-find colorways = rare
- Grails: Nike OGs, limited Jordan Burroughs releases, vintage Asics, samples, <500 pairs type hype

If a colorway name suggests a limited run (e.g. "Oregon", "Michigan", "Cherry", "Gold Medal"), weight
that colorway — not just the base model.

Return ONLY valid JSON:
{
  "rarity": "common|uncommon|rare|grail",
  "rarity_note": "one sentence for buyers explaining why"
}
`;

export function rarityAssessUserMessage(params: {
  brand: string;
  model: string;
  colorway?: string | null;
  modelYear?: number | null;
  catalogContext?: string;
}): string {
  const lines = [
    `Brand: ${params.brand}`,
    `Model: ${params.model}`,
    params.colorway ? `Colorway: ${params.colorway}` : null,
    params.modelYear ? `Model year: ${params.modelYear}` : null,
  ].filter(Boolean);

  const catalog = params.catalogContext?.trim()
    ? `\n\nCatalog reference (use when this shoe matches):\n${params.catalogContext}`
    : '';

  return `Assess rarity for this wrestling shoe listing:\n${lines.join('\n')}${catalog}`;
}
