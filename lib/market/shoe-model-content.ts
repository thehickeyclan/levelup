import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import {
  SHOE_ABOUT_PROMPT_VERSION,
  SHOE_HISTORY_PROMPT_VERSION,
  SHOE_HISTORY_SYSTEM_PROMPT,
  buildShoeHistoryUserPrompt,
} from '@/lib/market/ai/prompts';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import { parseModelYearHint } from '@/lib/market/parse-model-year';
import {
  curatedCatalogHistory,
  historyContradictsReleaseYear,
  historyMentionsAthleteEdition,
  sanitizeCatalogDisplayText,
  sanitizeCatalogHistoryText,
  stripAthleteEditionFromDescription,
} from '@/lib/market/catalog-display-text';

export type ShoeModelAbout = {
  brand: string;
  model: string;
  release_year: number | null;
  shoe_type: string | null;
  upper_material: string | null;
  sole_type: string | null;
  closure_type: string | null;
  fit_notes: string | null;
  notable_features: string | null;
  history_text: string | null;
  ai_generated: boolean;
  verified: boolean;
  source_notes: string | null;
  reference_url: string | null;
};

const AboutSpecsSchema = z.object({
  shoe_type: z.string().trim().min(1).optional(),
  upper_material: z.string().trim().min(1).optional(),
  sole_type: z.string().trim().min(1).optional(),
  closure_type: z.string().trim().min(1).optional(),
  fit_notes: z.string().trim().min(1).optional(),
  notable_features: z.string().trim().min(1).optional(),
});

function isMissingCatalogAboutColumn(message: string): boolean {
  return /shoe_type|closure_type|fit_notes|notable_features|history_text|about_generated_at|history_generated_at|history_prompt_version|about_prompt_version|reference_url|source_notes|does not exist|schema cache/i.test(
    message
  );
}

function isVerifiedCatalogEntry(entry: Record<string, unknown> | null): boolean {
  return Boolean(entry?.verified);
}

function hasProtectedCatalogHistory(entry: Record<string, unknown> | null): boolean {
  if (!entry || !isVerifiedCatalogEntry(entry)) return false;
  const source = String(entry.source ?? '').trim().toLowerCase();
  return source === 'manual' || source === 'phipps_handbook';
}

function catalogHasAboutFields(entry: Record<string, unknown>): boolean {
  return (
    Boolean(entry.shoe_type) ||
    Boolean(entry.closure_type) ||
    Boolean(entry.fit_notes) ||
    Boolean(entry.notable_features) ||
    Boolean(entry.upper_material) ||
    Boolean(entry.sole_description)
  );
}

function catalogHistoryContext(entry: Record<string, unknown> | null) {
  if (!entry) return null;
  return {
    years_produced: (entry.years_produced as string | null) ?? null,
    upper_material: (entry.upper_material as string | null) ?? null,
    sole_description: (entry.sole_description as string | null) ?? null,
    collector_notes: (entry.collector_notes as string | null) ?? null,
    visual_identifiers: (entry.visual_identifiers as string[] | null) ?? null,
  };
}

function aboutNeedsRegeneration(entry: Record<string, unknown> | null): boolean {
  if (!entry) return true;
  if (isVerifiedCatalogEntry(entry) && catalogHasAboutFields(entry)) return false;
  const hasFields = catalogHasAboutFields(entry);
  if (!hasFields || !entry.about_generated_at) return true;
  const version = Number(entry.about_prompt_version ?? 0);
  return version < SHOE_ABOUT_PROMPT_VERSION;
}

function historyNeedsRegeneration(entry: Record<string, unknown> | null): boolean {
  if (!entry) return true;
  const text = String(entry.history_text ?? '').trim();
  const brand = String(entry.brand ?? '').trim();
  const model = String(entry.model ?? '').trim();
  if (!text) return true;
  if (curatedCatalogHistory(brand, model)) return false;
  if (hasProtectedCatalogHistory(entry)) return false;
  if (historyMentionsAthleteEdition(text, model)) return true;
  const releaseYear = parseModelYearHint(null, (entry.years_produced as string | null) ?? null);
  if (historyContradictsReleaseYear(text, releaseYear)) return true;
  if (isVerifiedCatalogEntry(entry)) return false;
  const version = Number(entry.history_prompt_version ?? 0);
  return version < SHOE_HISTORY_PROMPT_VERSION;
}

export async function shoeModelHistoryNeedsRegeneration(
  supabase: SupabaseClient,
  brand: string,
  model: string
): Promise<boolean> {
  const entry = (await findCatalogEntry(supabase, brand, model)) as Record<string, unknown> | null;
  return historyNeedsRegeneration(entry);
}

export async function shoeModelAboutNeedsRegeneration(
  supabase: SupabaseClient,
  brand: string,
  model: string
): Promise<boolean> {
  const entry = (await findCatalogEntry(supabase, brand, model)) as Record<string, unknown> | null;
  return aboutNeedsRegeneration(entry);
}

export function shoeModelAboutFromRow(
  row: Record<string, unknown>,
  modelYearHint?: number | null
): ShoeModelAbout | null {
  const brand = String(row.brand ?? '').trim();
  const model = String(row.model ?? '').trim();
  if (!brand || !model) return null;

  const releaseYear =
    modelYearHint ??
    parseModelYearHint(null, (row.years_produced as string | null) ?? null);

  const hasAbout =
    Boolean(row.shoe_type) ||
    Boolean(row.upper_material) ||
    Boolean(row.sole_description) ||
    Boolean(row.closure_type) ||
    Boolean(row.fit_notes) ||
    Boolean(row.notable_features);
  const hasHistory = Boolean(String(row.history_text ?? '').trim());

  if (!hasAbout && !hasHistory) return null;

  const verified = Boolean(row.verified);
  const hasAiTimestamps = Boolean(row.about_generated_at || row.history_generated_at);

  return {
    brand,
    model,
    release_year: releaseYear,
    shoe_type: sanitizeCatalogDisplayText(row.shoe_type as string | null),
    upper_material: sanitizeCatalogDisplayText(row.upper_material as string | null),
    sole_type: sanitizeCatalogDisplayText(row.sole_description as string | null),
    closure_type: sanitizeCatalogDisplayText(row.closure_type as string | null),
    fit_notes: sanitizeCatalogDisplayText(row.fit_notes as string | null),
    notable_features: sanitizeCatalogDisplayText(row.notable_features as string | null),
    history_text: sanitizeCatalogHistoryText(row.history_text as string | null, brand, model),
    ai_generated: hasAiTimestamps && !verified,
    verified,
    source_notes: (row.source_notes as string | null)?.trim() || null,
    reference_url: (row.reference_url as string | null)?.trim() || null,
  };
}

export async function fetchShoeModelAbout(
  supabase: SupabaseClient,
  brand: string,
  model: string,
  modelYearHint?: number | null
): Promise<ShoeModelAbout | null> {
  const entry = await findCatalogEntry(supabase, brand, model);
  if (!entry) return null;
  return shoeModelAboutFromRow(entry as Record<string, unknown>, modelYearHint);
}

async function generateAboutSpecs(
  brand: string,
  model: string,
  year: number | null,
  catalogEntry: Record<string, unknown> | null
): Promise<z.infer<typeof AboutSpecsSchema>> {
  const yearLabel = year ? ` (${year})` : '';
  const catalogSole = String(catalogEntry?.sole_description ?? '').trim();
  const catalogUpper = String(catalogEntry?.upper_material ?? '').trim();
  const catalogContext = [
    catalogSole ? `Known sole (prefer if accurate): ${catalogSole}` : null,
    catalogUpper ? `Known upper (prefer if accurate): ${catalogUpper}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const outcome = await callClaude(
    'You are a wrestling shoe expert. Return JSON only — no preamble, no markdown. Be precise about sole construction — only use "split sole" when the model truly has separate heel and forefoot pods. All string values must be plain prose — no bullet lists or asterisks.',
    [
      {
        type: 'text',
        text: `For the ${brand} ${model}${yearLabel} wrestling shoe, provide structured specs in JSON only:
${catalogContext ? `\n${catalogContext}\n` : ''}
{
  "shoe_type": "Competition / Training / Practice",
  "upper_material": "brief material description",
  "sole_type": "accurate sole — full-length/unisole rubber outsole OR split sole OR other; do not guess split sole",
  "closure_type": "Lace-up / Velcro / etc",
  "fit_notes": "True to size / Runs narrow / etc",
  "notable_features": "one key distinguishing feature"
}`,
      },
    ],
    800
  );

  if (!outcome.ok) throw new Error('Could not generate shoe specs');
  const parsed = AboutSpecsSchema.parse(
    JSON.parse(extractJsonFromClaude(outcome.result.text))
  );

  const catalogSoleTrim = String(catalogEntry?.sole_description ?? '').trim();
  const catalogUpperTrim = String(catalogEntry?.upper_material ?? '').trim();
  if (catalogSoleTrim) parsed.sole_type = catalogSoleTrim;
  if (catalogUpperTrim) parsed.upper_material = catalogUpperTrim;

  if (
    parsed.sole_type &&
    historyMentionsSplitSole(parsed.sole_type) &&
    catalogSoleTrim &&
    !catalogSoleIsSplit(catalogSoleTrim)
  ) {
    parsed.sole_type = catalogSoleTrim;
  }

  return parsed;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function catalogSoleIsSplit(sole: string | null | undefined): boolean {
  const lower = (sole ?? '').toLowerCase();
  return lower.includes('split');
}

function historyMentionsSplitSole(history: string): boolean {
  return /\bsplit[\s-]?sole\b/i.test(history);
}

function historyValidationError(
  history: string,
  catalogEntry: Record<string, unknown> | null,
  model: string,
  releaseYear: number | null
): string | null {
  const sole = String(catalogEntry?.sole_description ?? '').trim();
  if (sole && !catalogSoleIsSplit(sole) && historyMentionsSplitSole(history)) {
    return `Catalog sole is "${sole}" — not a split sole. Rewrite without split sole.`;
  }
  if (historyMentionsAthleteEdition(history, model)) {
    return `Model "${model}" is a base retail shoe — rewrite without Jordan Oliver, signature edition, or PE language.`;
  }
  if (historyContradictsReleaseYear(history, releaseYear)) {
    return `Release year is ${releaseYear} — rewrite so any introduction year matches ${releaseYear}. Do not invent a different year.`;
  }
  if (wordCount(history) > 120) {
    return 'Too long — rewrite to 3–4 sentences and 70–110 words.';
  }
  return null;
}

function mergeSpecsIntoEntry(
  entry: Record<string, unknown> | null,
  specs: z.infer<typeof AboutSpecsSchema>
): Record<string, unknown> {
  return {
    ...(entry ?? {}),
    shoe_type: specs.shoe_type ?? entry?.shoe_type ?? null,
    upper_material: specs.upper_material ?? entry?.upper_material ?? null,
    sole_description: specs.sole_type ?? entry?.sole_description ?? null,
    closure_type: specs.closure_type ?? entry?.closure_type ?? null,
    fit_notes: specs.fit_notes ?? entry?.fit_notes ?? null,
    notable_features: specs.notable_features ?? entry?.notable_features ?? null,
  };
}

async function generateHistoryParagraph(
  brand: string,
  model: string,
  year: number | null,
  catalogEntry: Record<string, unknown> | null,
  correction?: string
): Promise<string> {
  const basePrompt = buildShoeHistoryUserPrompt({
    brand,
    model,
    releaseYear: year,
    catalog: catalogHistoryContext(catalogEntry),
  });
  const prompt = correction
    ? `${basePrompt}\n\nCORRECTION REQUIRED: ${correction}\nRewrite the paragraph.`
    : basePrompt;

  const outcome = await callClaude(
    SHOE_HISTORY_SYSTEM_PROMPT,
    [{ type: 'text', text: prompt }],
    500
  );

  if (!outcome.ok) throw new Error('Could not generate shoe history');
  return outcome.result.text.trim();
}

async function generateValidatedHistoryParagraph(
  brand: string,
  model: string,
  year: number | null,
  catalogEntry: Record<string, unknown> | null
): Promise<string> {
  const curated = curatedCatalogHistory(brand, model);
  if (curated) return curated;

  let history = await generateHistoryParagraph(brand, model, year, catalogEntry);
  const firstError = historyValidationError(history, catalogEntry, model, year);
  if (firstError) {
    history = await generateHistoryParagraph(brand, model, year, catalogEntry, firstError);
    const secondError = historyValidationError(history, catalogEntry, model, year);
    if (secondError) {
      history = stripAthleteEditionFromDescription(history, model)
        .replace(/\bsplit[\s-]?sole\b/gi, 'full rubber outsole')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (
        historyMentionsAthleteEdition(history, model) ||
        historyContradictsReleaseYear(history, year)
      ) {
        if (curatedCatalogHistory(brand, model)) {
          history = curatedCatalogHistory(brand, model)!;
        }
      }
    }
  }
  if (historyMentionsAthleteEdition(history, model) || historyContradictsReleaseYear(history, year)) {
    const fallback = curatedCatalogHistory(brand, model);
    if (fallback) history = fallback;
  }
  return history;
}

export async function ensureShoeModelContent(
  admin: SupabaseClient,
  input: { brand: string; model: string; modelYear?: number | null; forceRegenerateHistory?: boolean }
): Promise<ShoeModelAbout | null> {
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (!brand || model.length < 2) return null;

  let entry = (await findCatalogEntry(admin, brand, model)) as Record<string, unknown> | null;
  const releaseYear =
    input.modelYear ??
    (entry ? parseModelYearHint(null, (entry.years_produced as string | null) ?? null) : null);

  const needsAbout = !entry || aboutNeedsRegeneration(entry);
  const needsHistory =
    input.forceRegenerateHistory || historyNeedsRegeneration(entry);

  if (!needsAbout && !needsHistory) {
    return shoeModelAboutFromRow(entry!, releaseYear);
  }

  try {
    let specs: z.infer<typeof AboutSpecsSchema> = {};
    let groundedEntry = entry;

    const shouldGenerateSpecs =
      needsAbout ||
      (needsHistory &&
        (!String(entry?.sole_description ?? '').trim() || historyNeedsRegeneration(entry)));

    if (shouldGenerateSpecs) {
      specs = await generateAboutSpecs(brand, model, releaseYear, entry);
      groundedEntry = mergeSpecsIntoEntry(entry, specs);
      entry = groundedEntry;
    }

    let historyText = (entry?.history_text as string | null)?.trim() || null;
    if (needsHistory) {
      historyText = await generateValidatedHistoryParagraph(
        brand,
        model,
        releaseYear,
        groundedEntry
      );
      if (historyText && historyMentionsAthleteEdition(historyText, model)) {
        historyText = curatedCatalogHistory(brand, model) ?? historyText;
      }
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      updated_at: now,
    };
    if (shouldGenerateSpecs) {
      Object.assign(payload, {
        shoe_type: specs.shoe_type ?? null,
        upper_material: specs.upper_material ?? entry?.upper_material ?? null,
        sole_description: specs.sole_type ?? entry?.sole_description ?? null,
        closure_type: specs.closure_type ?? null,
        fit_notes: specs.fit_notes ?? null,
        notable_features: specs.notable_features ?? null,
        about_generated_at: now,
        about_prompt_version: SHOE_ABOUT_PROMPT_VERSION,
      });
    }
    if (needsHistory && historyText) {
      payload.history_text = historyText;
      payload.history_generated_at = now;
      payload.history_prompt_version = SHOE_HISTORY_PROMPT_VERSION;
    }

    if (entry?.id) {
      const { data: updated, error } = await admin
        .from('wrestling_shoes_catalog')
        .update(payload)
        .eq('id', entry.id as string)
        .select('*')
        .single();
      if (error) {
        if (isMissingCatalogAboutColumn(error.message)) return null;
        throw error;
      }
      return shoeModelAboutFromRow(updated as Record<string, unknown>, releaseYear);
    }

    const { data: created, error: createErr } = await admin
      .from('wrestling_shoes_catalog')
      .insert({
        brand,
        model,
        years_produced: releaseYear ? String(releaseYear) : null,
        source: 'ai_generated',
        verified: false,
        ...payload,
      })
      .select('*')
      .single();

    if (createErr) {
      if (isMissingCatalogAboutColumn(createErr.message)) return null;
      throw createErr;
    }
    return shoeModelAboutFromRow(created as Record<string, unknown>, releaseYear);
  } catch (err) {
    console.error('ensureShoeModelContent:', err);
    return entry ? shoeModelAboutFromRow(entry, releaseYear) : null;
  }
}
