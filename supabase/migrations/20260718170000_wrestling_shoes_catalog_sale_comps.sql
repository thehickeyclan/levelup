-- Documented real-world sale comps (condition + sold price + optional photos)
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS sale_comps jsonb NOT NULL DEFAULT '[]'::jsonb;
