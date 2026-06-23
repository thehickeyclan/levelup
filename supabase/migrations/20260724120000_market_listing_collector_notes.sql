ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS collector_notes text;

COMMENT ON COLUMN public.market_listings.collector_notes IS
  'Buyer-facing collector context for this listing (history, release notes, PE story).';
