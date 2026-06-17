-- Seller follows: market users follow collectors/sellers for drop alerts.

CREATE TABLE IF NOT EXISTS public.market_seller_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, seller_id)
);

CREATE INDEX IF NOT EXISTS idx_market_seller_follows_seller ON public.market_seller_follows(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_seller_follows_follower ON public.market_seller_follows(follower_id);

ALTER TABLE public.market_seller_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own market seller follows"
  ON public.market_seller_follows FOR ALL
  TO authenticated
  USING (follower_id = auth.uid())
  WITH CHECK (follower_id = auth.uid() AND follower_id <> seller_id);

CREATE POLICY "Sellers read own market followers"
  ON public.market_seller_follows FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());
