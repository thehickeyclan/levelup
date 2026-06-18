-- Optional AI background-removed display images (original preserved).
ALTER TABLE public.market_listing_images
  ADD COLUMN IF NOT EXISTS clean_storage_path text,
  ADD COLUMN IF NOT EXISTS clean_public_url text,
  ADD COLUMN IF NOT EXISTS use_clean boolean NOT NULL DEFAULT false;
