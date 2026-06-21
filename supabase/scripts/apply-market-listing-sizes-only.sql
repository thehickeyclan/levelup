-- BNIB multi-size inventory + order size_us
-- Run this entire file in Supabase Dashboard → SQL Editor.

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

DROP TRIGGER IF EXISTS market_listing_sizes_updated_at ON public.market_listing_sizes;
CREATE TRIGGER market_listing_sizes_updated_at
  BEFORE UPDATE ON public.market_listing_sizes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.market_listing_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_listing_sizes_select ON public.market_listing_sizes;
CREATE POLICY market_listing_sizes_select ON public.market_listing_sizes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id
        AND (
          l.status IN ('active', 'sold', 'traded')
          OR l.seller_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS market_listing_sizes_insert ON public.market_listing_sizes;
CREATE POLICY market_listing_sizes_insert ON public.market_listing_sizes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS market_listing_sizes_update ON public.market_listing_sizes;
CREATE POLICY market_listing_sizes_update ON public.market_listing_sizes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS market_listing_sizes_delete ON public.market_listing_sizes;
CREATE POLICY market_listing_sizes_delete ON public.market_listing_sizes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

COMMENT ON TABLE public.market_listing_sizes IS 'Per-size inventory for BNIB/new listings with multiple sizes on one product page.';
