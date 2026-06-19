ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS color_family text;

COMMENT ON COLUMN public.market_listings.color_family IS 'Generic browse color (blue, red, black, …). Colorway stays the specific release name.';
