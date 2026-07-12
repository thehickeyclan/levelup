/** Remove internal AI/catalog scores from text shown to buyers. */
import {
  modelNameImpliesAthleteEdition,
  stripAthleteEditionFromDescription,
} from '@/lib/market/catalog-display-text';

export function sanitizeBuyerListingDescription(
  description: string | null | undefined,
  model?: string | null
): string {
  let text = String(description ?? '').trim();
  if (!text) return text;

  text = text.replace(/\n*Guild:\s*Historical[\s\S]*$/i, '').trim();

  const blocked =
    /Guild:\s*Historical|\bHistorical\s*\d|\bInterest\s*\d|\bRarity\s*\d|\bCultural\s*\d|wrestle[- ]?ready\s*(score)?|cosmetic\s*score|\/\s*10\b|AI[- ]assisted|confidence\s*note/i;

  text = text
    .split('\n')
    .filter((line) => !blocked.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (model && !modelNameImpliesAthleteEdition(model)) {
    text = stripAthleteEditionFromDescription(text, model);
  }

  return text;
}
