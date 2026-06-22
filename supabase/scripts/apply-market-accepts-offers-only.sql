-- Accept offers toggle for For Sale listings with a list price.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS accepts_offers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.market_listings.accepts_offers IS
  'When true on sell listings with a list price, buyers can submit cash offers below asking.';
