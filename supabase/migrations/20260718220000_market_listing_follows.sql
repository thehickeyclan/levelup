-- Follow individual pairs: get updates when listing type, status, price, or offers change.

CREATE TABLE IF NOT EXISTS public.market_listing_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.market_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_market_listing_follows_listing ON public.market_listing_follows(listing_id);
CREATE INDEX IF NOT EXISTS idx_market_listing_follows_follower ON public.market_listing_follows(follower_id);

ALTER TABLE public.market_listing_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own market listing follows"
  ON public.market_listing_follows FOR ALL
  TO authenticated
  USING (follower_id = auth.uid())
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "Sellers read followers on own listings"
  ON public.market_listing_follows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.market_listings ml
      WHERE ml.id = listing_id AND ml.seller_id = auth.uid()
    )
  );
