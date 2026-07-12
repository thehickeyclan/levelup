import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import { parseModelYearHint } from '@/lib/market/parse-model-year';

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
  return /shoe_type|closure_type|fit_notes|notable_features|history_text|about_generated_at|history_generated_at|does not exist|schema cache/i.test(
    message
  );
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

  return {
    brand,
    model,
    release_year: releaseYear,
    shoe_type: (row.shoe_type as string | null)?.trim() || null,
    upper_material: (row.upper_material as string | null)?.trim() || null,
    sole_type: (row.sole_description as string | null)?.trim() || null,
    closure_type: (row.closure_type as string | null)?.trim() || null,
    fit_notes: (row.fit_notes as string | null)?.trim() || null,
    notable_features: (row.notable_features as string | null)?.trim() || null,
    history_text: (row.history_text as string | null)?.trim() || null,
    ai_generated: Boolean(row.about_generated_at || row.history_generated_at),
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
  year: number | null
): Promise<z.infer<typeof AboutSpecsSchema>> {
  const yearLabel = year ? ` (${year})` : '';
  const outcome = await callClaude(
    'You are a wrestling shoe expert. Return JSON only — no preamble, no markdown.',
    [
      {
        type: 'text',
        text: `For the ${brand} ${model}${yearLabel} wrestling shoe, provide structured specs in JSON only:
{
  "shoe_type": "Competition / Training / Practice",
  "upper_material": "brief material description",
  "sole_type": "brief sole description",
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
  return parsed;
}

async function generateHistoryParagraph(
  brand: string,
  model: string,
  year: number | null
): Promise<string> {
  const yearLabel = year ? ` (${year})` : '';
  const outcome = await callClaude(
    'You are a wrestling shoe historian and collector. Plain text only — no markdown.',
    [
      {
        type: 'text',
        text: `Write a 3-5 sentence history of the ${brand} ${model} wrestling shoe${yearLabel}.

Cover: when/why it was created, what made it significant, how it was used in the wrestling community, and its legacy or collector status today.

Write in a premium, knowledgeable tone — like a specialist auction house describing a collectible. Return only the paragraph.`,
      },
    ],
    900
  );

  if (!outcome.ok) throw new Error('Could not generate shoe history');
  return outcome.result.text.trim();
}

export async function ensureShoeModelContent(
  admin: SupabaseClient,
  input: { brand: string; model: string; modelYear?: number | null }
): Promise<ShoeModelAbout | null> {
  const brand = input.brand.trim();
  const model = input.model.trim();
  if (!brand || model.length < 2) return null;

  let entry = (await findCatalogEntry(admin, brand, model)) as Record<string, unknown> | null;
  const releaseYear =
    input.modelYear ??
    (entry ? parseModelYearHint(null, (entry.years_produced as string | null) ?? null) : null);

  const needsAbout =
    !entry ||
    (!entry.shoe_type &&
      !entry.closure_type &&
      !entry.fit_notes &&
      !entry.notable_features &&
      !entry.about_generated_at);
  const needsHistory = !entry || (!entry.history_text && !entry.history_generated_at);

  if (!needsAbout && !needsHistory) {
    return shoeModelAboutFromRow(entry!, releaseYear);
  }

  try {
    let specs: z.infer<typeof AboutSpecsSchema> = {};
    if (needsAbout) {
      specs = await generateAboutSpecs(brand, model, releaseYear);
    }

    let historyText = (entry?.history_text as string | null)?.trim() || null;
    if (needsHistory) {
      historyText = await generateHistoryParagraph(brand, model, releaseYear);
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      updated_at: now,
    };
    if (needsAbout) {
      Object.assign(payload, {
        shoe_type: specs.shoe_type ?? null,
        upper_material: specs.upper_material ?? entry?.upper_material ?? null,
        sole_description: specs.sole_type ?? entry?.sole_description ?? null,
        closure_type: specs.closure_type ?? null,
        fit_notes: specs.fit_notes ?? null,
        notable_features: specs.notable_features ?? null,
        about_generated_at: now,
      });
    }
    if (needsHistory && historyText) {
      payload.history_text = historyText;
      payload.history_generated_at = now;
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
