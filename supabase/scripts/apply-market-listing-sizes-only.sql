-- Minimal patch: BNIB multi-size inventory + order size_us
-- Run in Supabase SQL Editor if migrations are not pushed yet.

CREATE TABLE IF NOT EXISTS public.market_listing_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  size_us numeric(4,1) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, size_us)
);

CREATE INDEX IF NOT EXISTS idx_market_listing_sizes_listing ON public.market_listing_sizes (listing_id);

ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS size_us numeric(4,1);
