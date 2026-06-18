-- Per-colorway pricing: availability, retail anchor, value tier, collector range
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS colorway_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;
