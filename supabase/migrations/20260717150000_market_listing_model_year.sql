-- Optional model/release year for pricing and search (e.g. JB Elite III year).

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS model_year integer;

COMMENT ON COLUMN public.market_listings.model_year IS 'Shoe model release year (optional). Helps AI pricing and collector comps.';
