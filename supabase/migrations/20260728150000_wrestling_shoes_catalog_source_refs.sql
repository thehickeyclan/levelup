-- Verification attribution for handbook- and admin-confirmed catalog rows
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS reference_url text,
  ADD COLUMN IF NOT EXISTS source_notes text;
