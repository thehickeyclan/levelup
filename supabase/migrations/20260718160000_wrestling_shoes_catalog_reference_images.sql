-- Store admin-confirmed training photos on catalog entries for visual matching
ALTER TABLE public.wrestling_shoes_catalog
  ADD COLUMN IF NOT EXISTS reference_image_urls text[] DEFAULT '{}'::text[];
