-- Dual condition scores: wrestle-ready (functional) + cosmetic (appearance/collector).

ALTER TABLE public.market_ai_analysis
  ADD COLUMN IF NOT EXISTS cosmetic_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS cosmetic_summary text;

COMMENT ON COLUMN public.market_ai_analysis.condition_score IS 'Wrestle-ready score 1–10 (tread, structure, usability).';
COMMENT ON COLUMN public.market_ai_analysis.cosmetic_score IS 'Appearance score 1–10 (whiteness, yellowing, collector appeal).';
