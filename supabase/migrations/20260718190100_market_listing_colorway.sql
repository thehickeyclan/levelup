ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS colorway text;

COMMENT ON COLUMN public.market_listings.colorway IS 'Specific colorway name (e.g. Cherry) for catalog-matched pricing.';
