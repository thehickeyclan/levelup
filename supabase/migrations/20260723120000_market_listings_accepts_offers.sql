-- For Sale listings: optional cash offers below list price (listing_type = 'sell' only).

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS accepts_offers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.market_listings.accepts_offers IS
  'When true on sell listings with a list price, buyers can submit cash offers below asking.';
