-- Documented launch / catalog pricing for collector appreciation analysis
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS original_msrp_cents integer,
  ADD COLUMN IF NOT EXISTS catalog_price_cents integer,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS inflation_adjusted_price text;
