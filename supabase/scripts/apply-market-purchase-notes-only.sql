-- Minimal patch: private purchase notes on closet pairs.
-- Run in Supabase SQL Editor if you only need purchase_source / purchase_price_cents / purchased_at.
-- Does NOT create the full Guild Market schema.

ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS purchase_source text,
  ADD COLUMN IF NOT EXISTS purchase_price_cents integer,
  ADD COLUMN IF NOT EXISTS purchased_at date;

COMMENT ON COLUMN public.market_listings.purchase_source IS 'Where the seller originally bought the pair (private — seller eyes only).';
COMMENT ON COLUMN public.market_listings.purchase_price_cents IS 'What the seller paid for the pair in cents (private — seller eyes only).';
COMMENT ON COLUMN public.market_listings.purchased_at IS 'When the seller bought the pair (private — seller eyes only).';
