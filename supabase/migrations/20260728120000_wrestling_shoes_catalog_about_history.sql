-- Model-level About + History content for listing detail pages (generated once per catalog entry)
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS shoe_type text,
  ADD COLUMN IF NOT EXISTS closure_type text,
  ADD COLUMN IF NOT EXISTS fit_notes text,
  ADD COLUMN IF NOT EXISTS notable_features text,
  ADD COLUMN IF NOT EXISTS history_text text,
  ADD COLUMN IF NOT EXISTS about_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_generated_at timestamptz;
